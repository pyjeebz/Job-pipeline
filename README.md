# Job Pipeline

A Next.js app that finds backend, DevOps/cloud and full-stack jobs every day,
keeps the ones you can take from Canada, scores them against your three CVs,
logs everything in a Google Sheet, and gives you a dashboard to approve and
apply from. Set up for Mujeeb Lawal-Saka. The daily run happens on GitHub
Actions; the dashboard runs on your PC.

Forked from [0xDaniiel/Job-pipeline](https://github.com/0xDaniiel/Job-pipeline).

## How it works

```
GitHub Actions (7am Toronto daily) -> scripts/run-pipeline.mjs
                         |
   1. lib/fetchers/      pull jobs from 8 sources
   2. lib/filters.js     keep Canada (remote or onsite), remote US and
                         worldwide jobs; boost Canada; drop duplicates
   3. lib/scorer.js      score each job, pick the right CV
   4. lib/sheets.js      write the best new matches to the sheet
   5. lib/emailApply.js  find application emails in descriptions
   6. approvals          send email applications, queue the rest
   7. lib/mailer.js      follow-up reminders and one daily digest

Dashboard (app/page.js) reads and updates the same sheet.
```

## Your day

1. Open the dashboard. Jobs are sorted by match score.
2. **Approve** a job you want. For an email job, your CV is sent at once
   (after a confirmation that shows the address). For a web-form job, it moves
   to Needs Manual Apply.
3. Open **Apply kit** on a job to copy your details and saved answers and to
   download the right CV. Open the application, fill it in, submit.
4. Click **Mark Applied**. A follow-up reminder is set for 7 days later.

Jobs scoring at or above `AUTO_APPROVE_MIN_SCORE` skip step 2. Only email jobs
are ever submitted for you; web forms are always submitted by you.

## Project layout

### Root

| File                 | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `middleware.js`      | Password login for the dashboard and API (HTTP Basic Auth).    |
| `package.json`       | Dependencies: next, react, googleapis, nodemailer, rss-parser. |
| `.env.local.example` | Template for every setting. Copy to `.env.local`.              |

### `config/` (edit these, no code changes)

| File             | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `countries.json` | Where you can work: Canada (remote or onsite, +10 score), US (remote only).    |
| `companies.json` | Company names checked on Greenhouse, Lever, Ashby, BambooHR.                   |
| `cvMapping.json` | Your CVs: file names, labels, and the keywords that choose between them.       |
| `applyKit.json`  | Your details and saved answers for the Apply kit. Replace the `EDIT ME` lines. |

### `app/`

| File                   | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `page.js`              | The dashboard: stats, tabs, Approve, Apply kit, LinkedIn links. |
| `api/run/route.js`     | The daily pipeline. Protected by `CRON_SECRET`.                 |
| `api/approve/route.js` | Approve and status changes. Sends email applications.           |
| `api/jobs/route.js`    | Reads the sheet for the dashboard.                              |
| `api/kit/route.js`     | Serves `applyKit.json` to the dashboard.                        |
| `api/resume/route.js`  | Downloads one of your CVs.                                      |
| `api/clear/route.js`   | Clear all (only works when `ALLOW_CLEAR=true`).                 |
| `api/format/route.js`  | One-time sheet styling. Run it once.                            |

### `lib/`

| File            | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| `sheets.js`     | All Google Sheet reads and writes.                             |
| `filters.js`    | Country filter, remote check, duplicate removal.               |
| `scorer.js`     | Match score and CV choice. Word lists at the top are editable. |
| `emailApply.js` | Finds an application email in a job description.               |
| `linkedin.js`   | Builds LinkedIn search links per company.                      |
| `mailer.js`     | Daily digest and follow-up emails.                             |
| `autoApply.js`  | Sends one application email with the right CV attached.        |
| `loadJson.js`   | Loads the config files.                                        |
| `cvs.js`        | Reads `cvMapping.json` for every part that needs a CV.         |
| `fetchers/`     | One file per job source, plus `index.js` that runs them all.   |

### `scripts/`

| File                  | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `check-companies.mjs` | Tests every company in `companies.json`, removes dead ones, adds new ones. |

### Other

`resumes/` holds your CV PDFs (git-ignored, they stay on your PC).
`.github/workflows/daily-pipeline.yml` is the daily run.
`.github/workflows/test.yml` runs the tests on every push.

## Settings (`.env.local`)

| Setting                                                                                 | What it does                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`          | Connect to your sheet.                                                     |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD`, `SMTP_SERVER`, `SMTP_PORT`, `DIGEST_RECIPIENT_EMAIL` | Sending email. Gmail needs an App Password.                                |
| `MINIMUM_MATCH_SCORE`                                                                   | Jobs below this never reach the sheet. Default 55.                         |
| `AUTO_APPROVE_MIN_SCORE`                                                                | Jobs at or above this skip the Approve step. Default 80.                   |
| `REQUIRE_REMOTE`                                                                        | `true` drops career-page jobs that don't look remote. Default false.       |
| `AUTO_SEND_EMAILS`                                                                      | `true` sends strong email-apply matches without your click. Default false. |
| `MAX_EMAILS_PER_RUN`                                                                    | Cap on automatic emails per run. Default 10.                               |
| `CRON_SECRET`                                                                           | Protects `/api/run`.                                                       |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD`                                                  | Switch on the dashboard login.                                             |
| `ALLOW_CLEAR`                                                                           | Enables Clear all. Keep false anywhere but your PC.                        |

## Setup on your PC

```bash
npm install
cp .env.local.example .env.local     # then fill it in
npm run dev                          # open http://localhost:3000
```

Google setup: create a Google Cloud project, enable the Sheets and Drive APIs,
make a service account, download its JSON key into `credentials/`, create the
sheet, and share it with the service account's email as Editor. Then run once:

```bash
curl -X POST http://localhost:3000/api/format
curl -X POST http://localhost:3000/api/run -H "x-cron-secret: YOUR_CRON_SECRET"
```

(If you set a dashboard login, add `-u USER:PASSWORD` to the `format` call.)

Keep the project in a plain folder such as `C:\Users\YOU\job-pipeline`. Do not
put it in OneDrive: syncing breaks `node_modules`.

## Keeping the company list healthy

```bash
node scripts/check-companies.mjs                 # report
node scripts/check-companies.mjs --fix           # remove dead names
node scripts/check-companies.mjs --add=greenhouse:dropbox,ashby:retool
```

Restart `npm run dev` after changing the list, because the fetchers read it at startup.

## Daily run on GitHub Actions

`.github/workflows/daily-pipeline.yml` runs the pipeline at 12:00 UTC
(7am Toronto in winter, 8am in summer). One-time setup:

1. In the fork, open the **Actions** tab and click **I understand my
   workflows, go ahead and enable them**. Scheduled workflows stay off in a
   fork until you do this.
2. Add these under **Settings > Secrets and variables > Actions > Secrets**:

   | Secret                        | Value                                              |
   | ----------------------------- | -------------------------------------------------- |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole service account key file, as one line.   |
   | `GOOGLE_SPREADSHEET_ID`       | The ID from your sheet's URL.                      |
   | `SMTP_EMAIL`                  | The Gmail address that sends the digest.           |
   | `SMTP_APP_PASSWORD`           | A Gmail App Password (not your login password).    |
   | `DIGEST_RECIPIENT_EMAIL`      | Where the digest goes.                             |

   Or from a terminal (`gh` logged in, run in the repo folder):

   ```bash
   gh secret set GOOGLE_SERVICE_ACCOUNT_JSON < credentials/keys.json
   gh secret set GOOGLE_SPREADSHEET_ID
   gh secret set SMTP_EMAIL
   gh secret set SMTP_APP_PASSWORD
   gh secret set DIGEST_RECIPIENT_EMAIL
   ```

3. Optional **Variables** (same page, Variables tab): `GOOGLE_SHEET_TAB`,
   `MINIMUM_MATCH_SCORE`, `AUTO_APPROVE_MIN_SCORE`, `REQUIRE_REMOTE`,
   `SMTP_SERVER`, `SMTP_PORT`. Defaults match `.env.local.example`.
4. Test it: **Actions > Daily pipeline > Run workflow**, or
   `gh workflow run daily-pipeline.yml`. The log is in the run page.

The Actions run never sends an application email: your CVs are not in the
public repo. Click **Approve** on email jobs in your local dashboard and they
are sent from your PC at once. A job still marked Approved when the daily run
starts (because a send failed) moves to Needs Manual Apply.

GitHub pauses scheduled workflows in a public repo after 60 days without a
commit. If the digest stops, re-enable the workflow on the Actions tab.

## Security

- `.env.local` and `credentials/` must never be committed. Check with
  `git check-ignore -v .env.local credentials/keys.json`.
- The dashboard login uses Basic Auth, which is readable on plain `http://`.
  Use the SSH tunnel or HTTPS.
- `config/applyKit.json` holds your saved answers. Do not commit a real salary
  number to a public repo.
- Rotate the service account key, app password, and `CRON_SECRET` if they are
  ever pasted somewhere public.

## Known limits

- Only email applications are sent for you. Web forms (most jobs) are
  submitted by you; the Apply kit makes that faster.
- Scoring is a keyword-based first pass. Read the posting before applying.
- Country matching is text based and can miss unusual wording. Extend
  `SYNONYMS` in `lib/filters.js` when it does.
- Salaries are not read from postings, so the sheet shows "Not listed".
- Email detection can pick the wrong address. Check the address on the
  dashboard card before approving.
- LinkedIn and Indeed are not sources: neither offers individual API access.

## Next steps

1. Watch a few real runs and tune the word lists in `lib/scorer.js` and
   `MINIMUM_MATCH_SCORE`.
2. Run `check-companies.mjs` every month and add companies from your target list.
3. Finish the GitHub Actions setup (section above).
4. Build the LinkedIn alert-email reader.
5. Build an assisted-apply script if submitting forms takes too long.
6. More Canadian sources: Job Bank, Indeed Canada alerts.
7. Add Canadian employers to `config/companies.json` as you find them.
