// filters.js
// Keeps jobs you can actually take (rules in config/countries.json) and
// removes jobs already in the Google Sheet.
//
//   Canada named          -> kept, remote or onsite, gets a score boost
//   US named              -> kept only if the job is remote, flagged so you
//                            check US work authorization
//   worldwide / N. America -> kept
//   anything else named   -> dropped
//   no location at all    -> kept (treated as open)

import { loadJson } from "./loadJson.js";

const countriesConfig = loadJson(import.meta.url, "../config/countries.json");

const lower = (list) => (list || []).map((s) => s.toLowerCase());

const PRIORITY_COUNTRY = (countriesConfig.priority_country || "").toLowerCase();
const PRIORITY_BOOST = Number(countriesConfig.priority_score_boost || 0);
const ONSITE_OK = new Set(lower(countriesConfig.onsite_ok));
const REMOTE_OK = new Set(lower(countriesConfig.remote_ok));
const PLACE_ALIASES = Object.fromEntries(
  Object.entries(countriesConfig.place_aliases || {}).map(([k, v]) => [
    k.toLowerCase(),
    lower(v),
  ]),
);
const OPEN_REGIONS = lower(countriesConfig.open_regions);
const EXCLUDED_PLACES = lower(countriesConfig.excluded_places);

const REMOTE_SIGNALS = ["remote", "worldwide", "anywhere", "global", "distributed"];

// Phrases in a description that make clear the job is remote.
const REMOTE_TEXT =
  /\b(fully remote|100% remote|remote[- ]first|remote[- ]friendly|work from anywhere|work remotely|remote position|remote role|this is a remote)\b/i;

// These boards only list remote jobs, so every job from them is remote even
// when its location text is just a country name.
const REMOTE_ONLY_SOURCES = ["remotive", "weworkremotely", "himalayas", "remoteok"];

// Set REQUIRE_REMOTE=true to drop every non-remote job, Canadian onsite
// jobs included. Off by default.
const REQUIRE_REMOTE = process.env.REQUIRE_REMOTE === "true";

// Whole-word match, so "us" does not match "business".
const regexCache = new Map();
function hasWord(text, word) {
  let re = regexCache.get(word);
  if (!re) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    regexCache.set(word, re);
  }
  return re.test(text);
}

// Countries from place_aliases that the location names, e.g. "Toronto, ON"
// -> ["canada"].
export function namedCountries(location) {
  const loc = (location || "").toLowerCase();
  return Object.entries(PLACE_ALIASES)
    .filter(([, aliases]) => aliases.some((a) => hasWord(loc, a)))
    .map(([country]) => country);
}

// True if the job is clearly remote: it came from a remote-only board, the
// location or title says so, or the description says so.
export function isRemoteJob(job) {
  if (REMOTE_ONLY_SOURCES.includes(job.source)) return true;
  const loc = (job.location || "").toLowerCase();
  const title = (job.title || "").toLowerCase();
  if (REMOTE_SIGNALS.some((s) => loc.includes(s) || title.includes(s)))
    return true;
  return REMOTE_TEXT.test((job.description || "").slice(0, 4000));
}

// Decides whether you can take a job based on where it is.
// Returns { ok, reason, priority, usOnly }.
export function checkJobLocation(job) {
  const location = (job.location || "").trim();
  const loc = location.toLowerCase();
  const remote = isRemoteJob(job);

  if (!loc) {
    return { ok: true, reason: "No location specified, treated as open" };
  }

  const countries = namedCountries(loc);
  if (countries.length) {
    if (countries.some((c) => ONSITE_OK.has(c))) {
      return {
        ok: true,
        reason: `In ${countries.join(", ")} (remote or onsite is fine)`,
        priority: countries.includes(PRIORITY_COUNTRY),
      };
    }
    if (remote && countries.some((c) => REMOTE_OK.has(c))) {
      return {
        ok: true,
        reason: `Remote in ${countries.join(", ")}`,
        usOnly: countries.every((c) => c === "united states"),
      };
    }
    return {
      ok: false,
      reason: `'${location}' is ${countries.join(", ")} but not remote`,
    };
  }

  if (OPEN_REGIONS.some((r) => hasWord(loc, r))) {
    return { ok: true, reason: "Open to North America or worldwide" };
  }

  const excluded = EXCLUDED_PLACES.find((p) => hasWord(loc, p));
  if (excluded) {
    return { ok: false, reason: `'${location}' is limited to ${excluded}` };
  }

  if (REMOTE_SIGNALS.some((s) => loc.includes(s))) {
    return { ok: true, reason: "Remote, no country restriction named" };
  }

  return {
    ok: false,
    reason: `'${location}' is not in Canada and isn't remote in Canada/US`,
  };
}

export function filterJobs(jobs) {
  const passed = [];
  for (const job of jobs) {
    if (REQUIRE_REMOTE && !isRemoteJob(job)) continue;
    const { ok, reason, priority, usOnly } = checkJobLocation(job);
    if (!ok) continue;
    passed.push({
      ...job,
      eligibilityReason: reason,
      locationBonus: priority ? PRIORITY_BOOST : 0,
      inPriorityCountry: Boolean(priority),
      locationRestricted: Boolean(usOnly),
    });
  }
  return passed;
}

// Removes jobs with no link, jobs already in the sheet, and duplicates
// within this batch. existingLinks is a Set from getExistingLinks().
export function deduplicate(jobs, existingLinks) {
  const seen = new Set(existingLinks);
  return jobs.filter((j) => {
    if (!j.link || seen.has(j.link)) return false;
    seen.add(j.link);
    return true;
  });
}
