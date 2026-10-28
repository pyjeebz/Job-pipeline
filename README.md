# Job Pipeline

A Next.js app that finds new grad and entry-level (up to 3 years) backend,
infrastructure and full-stack jobs every day, keeps the ones you can take
from Canada, scores and ranks them, logs everything in a Google Sheet, and
gives you a dashboard to approve and apply from. Set up for Mujeeb Lawal-Saka. The daily run happens on GitHub
Actions; the dashboard runs on your PC.

Forked from [0xDaniiel/Job-pipeline](https://github.com/0xDaniiel/Job-pipeline).

## How it works

```
GitHub Actions (8am + 4pm Toronto) -> scripts/run-pipeline.mjs
                         |
   1. lib/fetchers/      pull jobs from 8 sources
   2. lib/filters.js     keep Canada (remote or onsite), remote US and
                         worldwide jobs; boost Canada; drop duplicates
   3. lib/scorer.js      score each job (entry level, <= 3 years asked),
                         tag its track: Infra/DevOps/SRE, Backend, Full-stack
   4. lib/sheets.js      write the best new matches to the sheet
   5. approvals          strong matches go straight to Needs Manual Apply
   6. lib/mailer.js      follow-up reminders and a daily digest (optional,
                         only when SMTP is set)

Dashboard (app/page.js) reads and updates the same sheet.
```

## Your day

1. Open the dashboard. Jobs are sorted by match score.
2. **Approve** a job you want. It moves to Needs Manual Apply.
3. Open **Apply kit** on a job to copy your details and saved answers and to
   download the right CV. Open the application, fill it in, submit.
4. Click **Mark Applied**. A follow-up reminder is set for 7 days later.

Jobs scoring at or above `AUTO_APPROVE_MIN_SCORE` skip step 2. Nothing is
ever submitted for you: you apply on each posting yourself.

## What gets picked

- **Level:** titles with junior, new grad, associate, entry level, or
  "Engineer I" rank highest; plain titles like "Software Engineer" are kept.
  Senior, staff, lead, principal, III/3+, and internship/co-op titles drop
  out, and so does any posting that asks for more than 3 years
  (`MAX_YEARS` in `lib/scorer.js`).
- **Roles:** infrastructure, platform, cloud, DevOps, SRE and production
  engineering; backend/Python; full-stack and general software engineering.
  Security engineering titles drop out.
- **Where:** Canada (remote or onsite, +10 score), remote US (flagged to
  check work authorization), and remote worldwide or North America.

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
| `cvMapping.json` | Role tracks, their keywords, and the resume file each one downloads.           |
| `applyKit.json`  | Public template for the Apply kit. Your real answers go in `applyKit.local.json` (git-ignored, read first). |

### `app/`

| File                   | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `page.js`              | The dashboard: stats, tabs, Approve, Apply kit, LinkedIn links. |
| `api/run/route.js`     | The daily pipeline. Protected by `CRON_SECRET`.                 |
| `api/approve/route.js` | Approve and status changes.                                     |
| `api/jobs/route.js`    | Reads the sheet for the dashboard.                              |
| `api/kit/route.js`     | Serves `applyKit.json` to the dashboard.                        |
| `api/resume/route.js`  | Downloads your resume.                                          |
| `api/clear/route.js`   | Clear all (only works when `ALLOW_CLEAR=true`).                 |
| `api/format/route.js`  | One-time sheet styling. Run it once.                            |

### `lib/`

| File            | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| `sheets.js`     | All Google Sheet reads and writes.                             |
| `filters.js`    | Country filter, remote check, duplicate removal.               |
| `scorer.js`     | Match score and track. Word lists at the top are editable.     |
| `linkedin.js`   | Builds LinkedIn search links per company.                      |
| `mailer.js`     | Optional daily digest and follow-up emails.                    |
| `loadJson.js`   | Loads the config files.                                        |
| `cvs.js`        | Reads `cvMapping.json` for every part that needs a track or CV.|
| `fetchers/`     | One file per job source, plus `index.js` that runs them all.   |

### `scripts/`

| File                  | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `check-companies.mjs` | Tests every company in `companies.json`, removes dead ones, adds new ones. |

### Other

`resumes/` holds your resume PDF (git-ignored, it stays on your PC).
`.github/workflows/daily-pipeline.yml` is the daily run.
`.github/workflows/test.yml` runs the tests on every push.

## Settings (`.env.local`)

| Setting                                                                                 | What it does                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`          | Connect to your sheet.                                                     |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD`, `SMTP_SERVER`, `SMTP_PORT`, `DIGEST_RECIPIENT_EMAIL` | Optional digest email. Gmail needs an App Password.                        |
| `MINIMUM_MATCH_SCORE`                                                                   | Jobs below this never reach the sheet. Default 55.                         |
| `AUTO_APPROVE_MIN_SCORE`                                                                | Jobs at or above this skip the Approve step. Default 80.                   |
| `REQUIRE_REMOTE`                                                                        | `true` drops career-page jobs that don't look remote. Default false.       |
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

`.github/workflows/daily-pipeline.yml` runs the pipeline twice a day, at
13:00 and 21:00 UTC (8am and 4pm Toronto in winter, 9am and 5pm in summer).
Each run adds up to 50 new jobs. One-time setup:

1. In the fork, open the **Actions** tab and click **I understand my
   workflows, go ahead and enable them**. Scheduled workflows stay off in a
   fork until you do this.
2. Add these under **Settings > Secrets and variables > Actions > Secrets**:

   | Secret                        | Value                                              |
   | ----------------------------- | -------------------------------------------------- |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole service account key file, as one line.   |
   | `GOOGLE_SPREADSHEET_ID`       | The ID from your sheet's URL.                      |

   Only if you want the daily digest email: `SMTP_EMAIL`, `SMTP_APP_PASSWORD`
   (a Gmail App Password) and `DIGEST_RECIPIENT_EMAIL`.

   Or from a terminal (`gh` logged in, run in the repo folder):

   ```bash
   gh secret set GOOGLE_SERVICE_ACCOUNT_JSON < credentials/keys.json
   gh secret set GOOGLE_SPREADSHEET_ID
   ```

3. Optional **Variables** (same page, Variables tab): `GOOGLE_SHEET_TAB`,
   `MINIMUM_MATCH_SCORE`, `AUTO_APPROVE_MIN_SCORE`, `REQUIRE_REMOTE`,
   `SMTP_SERVER`, `SMTP_PORT`. Defaults match `.env.local.example`.
4. Test it: **Actions > Daily pipeline > Run workflow**, or
   `gh workflow run daily-pipeline.yml`. The log is in the run page.

GitHub pauses scheduled workflows in a public repo after 60 days without a
commit. If the digest stops, re-enable the workflow on the Actions tab.

## Security

- `.env.local` and `credentials/` must never be committed. Check with
  `git check-ignore -v .env.local credentials/keys.json`.
- The dashboard login uses Basic Auth, which is readable on plain `http://`.
  Use the SSH tunnel or HTTPS.
- Your real Apply kit answers (salary, work permit) live in
  `config/applyKit.local.json`, which is git-ignored. Keep them out of
  `config/applyKit.json`, which is public.
- Rotate the service account key, app password, and `CRON_SECRET` if they are
  ever pasted somewhere public.

## Known limits

- Nothing is submitted for you; the Apply kit makes applying faster.
- Experience is read from phrases like "3+ years of experience". A posting
  that states it another way slips through; check before applying.
- Scoring is a keyword-based first pass. Read the posting before applying.
- Location matching is text based and can miss unusual wording. Add the
  city to `place_aliases` in `config/countries.json` when it does.
- Salaries are not read from postings, so the sheet shows "Not listed".
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
