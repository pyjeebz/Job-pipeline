// mailer.js
// Sends the daily digest and follow-up reminder emails via SMTP (Gmail by
// default). Optional: with SMTP_EMAIL or SMTP_APP_PASSWORD unset, the
// pipeline skips these emails and everything else still runs.
// For Gmail this MUST be an App Password, not your normal login password:
// Google Account > Security > 2-Step Verification > App Passwords.

import nodemailer from "nodemailer";
import { linkedinLinks } from "./linkedin.js";

export function emailEnabled() {
  return Boolean(process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD);
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_SERVER || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
}

async function send(subject, html) {
  const recipient =
    process.env.DIGEST_RECIPIENT_EMAIL || process.env.SMTP_EMAIL;
  try {
    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_EMAIL,
      to: recipient,
      subject,
      html,
    });
    console.log(`[mailer] Sent: ${subject}`);
  } catch (err) {
    console.warn(`[mailer] FAILED to send '${subject}': ${err.message}`);
  }
}

function jobRowHtml(job) {
  const li = linkedinLinks(job.Company || job.company || "");
  return `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">
        <strong>${job["Role Title"] || job.title || ""}</strong><br>
        <span style="color:#555;">${job.Company || job.company || ""}, ${job["Country/Remote"] || job.location || ""}</span><br>
        <span style="color:#777;font-size:13px;">
          Match: ${job["Match Score"] ?? job.matchScore ?? "?"}/100 |
          CV: ${job["CV Version Used"] || job.cvVersion || ""} |
          Type: ${job["Employment Type"] || job.employmentType || "Unknown"}
        </span><br>
        <a href="${job.Link || job.link || ""}">${job.Link || job.link || ""}</a><br>
        <span style="font-size:13px;">LinkedIn: <a href="${li.company}">Company</a> | <a href="${li.recruiters}">Recruiters</a> | <a href="${li.engineers}">Engineers</a></span>
      </td>
    </tr>
  `;
}

export async function sendDailyDigest({
  needsApproval = [],
  needsManualApply = [],
}) {
  const sections = [];

  if (needsManualApply.length) {
    sections.push(`
      <h2 style="color:#1f2a54;">Needs Your Action: Manual Apply (${needsManualApply.length})</h2>
      <p style="color:#555;">Approved and ready for you to apply on the posting.</p>
      <table style="width:100%;border-collapse:collapse;">${needsManualApply.map(jobRowHtml).join("")}</table>
    `);
  }

  if (needsApproval.length) {
    sections.push(`
      <h2 style="color:#1f2a54;">New Matches Awaiting Your Approval (${needsApproval.length})</h2>
      <p style="color:#555;">Open the dashboard and click Approve for any you want to apply to.</p>
      <table style="width:100%;border-collapse:collapse;">${needsApproval.map(jobRowHtml).join("")}</table>
    `);
  }

  if (!sections.length) {
    sections.push(
      "<p>No new matches or manual-apply items today.</p>",
    );
  }

  const total = needsApproval.length + needsManualApply.length;
  const html = `
    <html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <h1 style="color:#1f2a54;">Your Job Search Digest</h1>
      ${sections.join("")}
      <p style="color:#999;font-size:12px;margin-top:30px;">
        Generated automatically. Review and manage everything in your Google Sheet or the dashboard.
      </p>
    </body></html>
  `;
  await send(`Job Search Digest: ${total} items today`, html);
}

export async function sendFollowUpReminder(dueJobs) {
  if (!dueJobs.length) return;
  const html = `
    <html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <h1 style="color:#1f2a54;">Follow-Up Reminders (${dueJobs.length})</h1>
      <p>These applications are due for a follow-up based on the date you set.</p>
      <table style="width:100%;border-collapse:collapse;">${dueJobs.map(jobRowHtml).join("")}</table>
    </body></html>
  `;
  await send(`Follow-Up Reminders: ${dueJobs.length} applications`, html);
}
