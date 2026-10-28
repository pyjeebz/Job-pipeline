// lib/pipeline.js
// The daily pipeline in one place. Two things run it:
//   - scripts/run-pipeline.mjs (the GitHub Actions daily run, plain Node)
//   - app/api/run/route.js (manual runs on your own PC)
//
// fetch -> filter -> dedup -> score -> write to sheet -> queue approvals
// -> follow-up reminders and daily digest (only when email is configured).

import { fetchAllJobs } from "./fetchers/index.js";
import { filterJobs, deduplicate } from "./filters.js";
import { scoreAll } from "./scorer.js";
import {
  addJobs,
  getExistingLinks,
  getJobsByStatus,
  updateStatus,
  setFollowUpDate,
  getDueFollowUps,
  STATUS,
} from "./sheets.js";
import {
  emailEnabled,
  sendDailyDigest,
  sendFollowUpReminder,
} from "./mailer.js";

const MAX_NEW_ROWS_PER_RUN = 50;

// Returns { success, log } or { success: false, error, log }. Never throws.
export async function runPipeline() {
  // Settings are read when the run starts, so changes to .env.local apply.
  const minimumScore = Number(process.env.MINIMUM_MATCH_SCORE || 55);
  const autoApproveMin = Number(process.env.AUTO_APPROVE_MIN_SCORE || 80);

  const log = [];
  const pushLog = (msg) => {
    console.log(msg);
    log.push(msg);
  };

  try {
    // --- fetch, filter, dedup ---
    pushLog("=== Fetching jobs from all sources ===");
    const rawJobs = await fetchAllJobs();
    pushLog(`Total raw jobs found: ${rawJobs.length}`);

    const eligibleJobs = filterJobs(rawJobs);
    pushLog(`After country filter: ${eligibleJobs.length}`);

    const existingLinks = await getExistingLinks();
    const newJobs = deduplicate(eligibleJobs, existingLinks);
    pushLog(`After removing duplicates already in sheet: ${newJobs.length}`);

    // --- score ---
    const scoredJobs = scoreAll(newJobs, minimumScore);
    pushLog(
      `After minimum match score (${minimumScore}): ${scoredJobs.length}`,
    );

    // --- write best matches in one batch ---
    const toAdd = [...scoredJobs]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_NEW_ROWS_PER_RUN);

    // Strong matches skip the Approve step and go straight to your
    // Needs Manual Apply queue. Everything else waits for your click.
    const autoApproved = [];
    const rowsToAdd = toAdd.map((job) => {
      const strong = job.matchScore >= autoApproveMin && !job.needsManualReview;
      const status = strong ? STATUS.NEEDS_MANUAL : STATUS.AWAITING_APPROVAL;
      if (strong) autoApproved.push(job);

      return {
        company: job.company || "",
        roleTitle: job.title || "",
        employmentType: job.employmentType || "Not specified",
        countryRemote: job.location || "",
        estSalary: "Not listed",
        matchScore: job.matchScore,
        cvVersion: job.cvVersion,
        link: job.link || "",
        submissionMethod: "Apply on posting",
        status,
        notes: [
          strong ? `Auto-approved (score ${job.matchScore})` : "",
          job.needsManualReview ? "Flagged for manual CV review" : "",
          job.inPriorityCountry ? "In Canada" : "",
          job.locationRestricted
            ? "US only: check you can work in the US before applying"
            : "",
        ]
          .filter(Boolean)
          .join(". "),
      };
    });
    await addJobs(rowsToAdd);
    pushLog(
      `Added ${rowsToAdd.length} new rows (${autoApproved.length} auto-approved).`,
    );

    // --- anything still marked Approved goes to the manual queue ---
    const approved = await getJobsByStatus(STATUS.APPROVED);
    for (const row of approved) {
      await updateStatus(row._row, STATUS.NEEDS_MANUAL);
    }
    pushLog(`Moved ${approved.length} approved jobs to Needs Manual Apply.`);

    if (!emailEnabled()) {
      pushLog("Email not configured: skipping follow-up reminders and digest.");
      return { success: true, log };
    }

    // --- follow-ups due today ---
    const dueFollowUps = await getDueFollowUps();
    if (dueFollowUps.length) {
      await sendFollowUpReminder(dueFollowUps);
      for (const row of dueFollowUps) {
        await updateStatus(row._row, STATUS.FOLLOWUP_SENT);
      }
    }
    pushLog(`Follow-ups sent: ${dueFollowUps.length}`);

    // --- daily digest ---
    const stillAwaiting = await getJobsByStatus(STATUS.AWAITING_APPROVAL);
    await sendDailyDigest({
      needsApproval: stillAwaiting,
      needsManualApply: [...autoApproved, ...approved],
    });
    pushLog("Daily digest sent.");

    return { success: true, log };
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    return { success: false, error: err.message, log };
  }
}
