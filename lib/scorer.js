// scorer.js
// Decides which resume (config/cvMapping.json) fits a job and computes a 0-100 match score.
// A lightweight first-pass filter, not a human read of the posting.
// Always read the real posting before applying.

import { CV_CATEGORIES, DEFAULT_CV_KEY } from "./cvs.js";

// You are targeting new grad and entry-level roles (up to 3 years of
// experience). Seniority is judged from the TITLE here, and from the years
// a posting asks for in requiredYears() below.
const SENIOR_WORDS = [
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "director",
  "head of",
  "vp",
  "manager",
  "architect",
  "expert",
  "iii",
  "iv",
  "engineer 3",
  "developer 3",
  "engineer 4",
  "developer 4",
  "level 3",
  "level 4",
];
const ENTRY_WORDS = [
  "junior",
  "jr",
  "entry level",
  "entry-level",
  "new grad",
  "new graduate",
  "recent graduate",
  "graduate",
  "university grad",
  "early career",
  "associate",
  "engineer i",
  "developer i",
  "engineer 1",
  "developer 1",
  "level 1",
];
// Internships and co-ops usually need you to be enrolled in school.
const STUDENT_WORDS = ["intern", "internship", "co-op", "coop", "student"];
// Phrases in a description that say the role is open to new grads.
const ENTRY_TEXT = [
  "new grad",
  "new graduate",
  "new graduates",
  "recent graduate",
  "recent graduates",
  "entry level",
  "entry-level",
  "early career",
  "early-career",
  "0-2 years",
  "0 - 2 years",
  "1-2 years",
  "1 - 2 years",
  "0-3 years",
  "1-3 years",
];
// The most experience you have, in years. Postings asking for more drop out.
const MAX_YEARS = 3;

// A role must look like a dev role by title.
const ROLE_WORDS = [
  "engineer",
  "developer",
  "programmer",
  "software",
  "backend",
  "back-end",
  "back end",
  "full stack",
  "full-stack",
  "fullstack",
  "cloud",
  "platform",
  "infrastructure",
  "infra",
  "systems",
  "devops",
  "sre",
  "site reliability",
  "reliability",
  "production engineer",
];

// Roles you are not looking for, whatever the stack.
const UNWANTED_TITLE = ["security engineer"];

// Titles that say "engineer" but are not developer jobs.
const NON_DEV_TITLE = [
  "support",
  "sales",
  "customer",
  "success",
  "account",
  "recruiter",
  "talent",
  "marketing",
  "designer",
  "attorney",
  "counsel",
  "legal",
  "finance",
  "accountant",
  "analyst",
  "people",
  "writer",
  "content",
  "community",
  "solutions",
  "services engineer",
  "researcher",
  "scientist",
  "technician",
  "developer relations",
  "advocate",
  "evangelist",
  "consultant",
  "specialist",
  "coordinator",
  "representative",
  "trainer",
];

// Stacks and specialities that are not a fit for the CVs.
const WRONG_STACK_TITLE = [
  "game",
  ".net",
  "dotnet",
  "c#",
  "c++",
  "php",
  "ruby",
  "rails",
  "java",
  "scala",
  "salesforce",
  "shopify",
  "wordpress",
  "sap",
  "servicenow",
  "machine learning",
  "ml",
  "data engineer",
  "data scientist",
  "embedded",
  "firmware",
  "hardware",
  "qa",
  "test",
  "sdet",
  "dba",
  "blockchain",
  "ios",
  "android",
  "mobile",
  "react native",
  "flutter",
  "frontend",
  "front-end",
  "front end",
  "ui engineer",
];

// A title containing one of these is a fit for the CVs, so a wrong-stack
// word next to it ("Python + Java Backend") is not penalised.
const FIT_STACK_TITLE = [
  "python",
  "golang",
  "node",
  "node.js",
  "typescript",
  "backend",
  "back-end",
  "back end",
  "full stack",
  "full-stack",
  "fullstack",
  "cloud",
  "aws",
  "kubernetes",
  "platform",
  "infrastructure",
  "infra",
  "systems",
  "devops",
  "sre",
  "site reliability",
  "reliability",
  "production engineer",
];

// At least one of these must appear somewhere, or the job isn't a fit.
const CORE_SKILLS = [
  "python",
  "golang",
  "aws",
  "gcp",
  "azure",
  "kubernetes",
  "k8s",
  "docker",
  "terraform",
  "linux",
  "django",
  "fastapi",
  "flask",
  "node.js",
  "nodejs",
  "typescript",
  "postgresql",
  "postgres",
];

const KNOWN_SKILLS = [
  ...CORE_SKILLS,
  "ci/cd",
  "github actions",
  "gitlab ci",
  "jenkins",
  "helm",
  "ansible",
  "prometheus",
  "grafana",
  "observability",
  "infrastructure as code",
  "redis",
  "kafka",
  "rabbitmq",
  "mongodb",
  "mysql",
  "rest api",
  "graphql",
  "grpc",
  "microservices",
  "distributed systems",
  "bash",
  "react",
  "next.js",
  "javascript",
  "git",
  "agile",
];

// Whole-word matching: "expo" must not match "exposure".
const regexCache = new Map();
function hasTerm(text, term) {
  let re = regexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re.test(text);
}

// The years of experience a posting asks for: the largest lower bound in
// phrases like "3+ years of experience" or "2-4 years of professional
// experience". null when it doesn't say.
const YEARS_RE =
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)\b[^.]{0,40}?\bexperience/g;
export function requiredYears(text) {
  let most = null;
  for (const m of (text || "").toLowerCase().matchAll(YEARS_RE)) {
    const n = Number(m[1]);
    if (n <= 20 && (most === null || n > most)) most = n;
  }
  return most;
}

function textBlob(job) {
  return `${job.title || ""} ${job.description || ""}`.toLowerCase();
}

export function pickCvVersion(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();

  // Pass 1: title keywords. If the title names a role type, trust it.
  let pass1Key = null;
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    if ((rules.titleKeywords || []).some((kw) => hasTerm(title, kw))) {
      pass1Key = key;
      break;
    }
  }

  // Pass 2: skill keyword overlap across the whole posting.
  const scores = {};
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    scores[key] = (rules.skillKeywords || []).filter((kw) =>
      hasTerm(blob, kw),
    ).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  const topKeys =
    maxScore > 0
      ? Object.keys(scores).filter((k) => scores[k] === maxScore)
      : [];
  const pass2Key = topKeys.length
    ? topKeys.includes(DEFAULT_CV_KEY)
      ? DEFAULT_CV_KEY
      : topKeys[0]
    : null;

  const finalKey = pass1Key || pass2Key || DEFAULT_CV_KEY;

  // Flag for a human only when the title gave no clue AND two different CVs
  // tie for the best skill match. A clear title is never flagged.
  const needsReview = !pass1Key && topKeys.length > 1;

  return {
    cvKey: finalKey,
    resumeFile: CV_CATEGORIES[finalKey].resumeFile,
    needsReview,
  };
}

export function computeMatchScore(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();
  let score = 15; // base

  // Skills overlap (up to 30). Capped low enough that the title, not a long
  // list of buzzwords, decides whether a job fits.
  const skillHits = KNOWN_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  score += Math.min(skillHits * 5, 30);

  // Seniority from the title: entry-level titles rank highest, plain titles
  // ("Software Engineer") are fine. Senior titles, internships, and postings
  // asking for more than MAX_YEARS are capped below the minimum at the end,
  // so no bonus (Canada, stack fit) can lift them back in.
  const seniorTitle = SENIOR_WORDS.some((w) => hasTerm(title, w));
  const studentTitle = STUDENT_WORDS.some((w) => hasTerm(title, w));
  const years = requiredYears(job.description);
  const tooManyYears = years !== null && years > MAX_YEARS;
  if (ENTRY_WORDS.some((w) => hasTerm(title, w))) score += 30;
  else score += 20;
  if (years !== null && !tooManyYears) score += 5;

  // The description says new grads are welcome.
  if (!seniorTitle && ENTRY_TEXT.some((w) => hasTerm(blob, w))) score += 10;

  if ((job.description || "").length > 200) score += 10;
  if (job.employmentType) score += 10;

  // Title relevance
  const titleFitsStack = FIT_STACK_TITLE.some((w) => hasTerm(title, w));
  if (titleFitsStack) score += 10;
  if (!ROLE_WORDS.some((w) => hasTerm(title, w))) score -= 40;
  if (NON_DEV_TITLE.some((w) => hasTerm(title, w))) score -= 60;
  if (UNWANTED_TITLE.some((w) => hasTerm(title, w))) score -= 60;
  if (!titleFitsStack && WRONG_STACK_TITLE.some((w) => hasTerm(title, w))) {
    score -= 40;
  }
  // No core backend/cloud skill anywhere: can't pass on bonuses alone
  const coreHits = CORE_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  if (coreHits === 0) score = Math.min(score, 45);

  // Jobs in your priority country (Canada) rank higher. The bonus is set in
  // config/countries.json and attached by filterJobs().
  score += job.locationBonus || 0;

  if (seniorTitle || studentTitle || tooManyYears) score = Math.min(score, 40);

  return Math.max(0, Math.min(100, score));
}

export function scoreAndTag(job) {
  const { cvKey, resumeFile, needsReview } = pickCvVersion(job);
  return {
    ...job,
    cvVersion: cvKey,
    resumeFile,
    matchScore: computeMatchScore(job),
    needsManualReview: needsReview,
  };
}

// Scores every job, keeps those at or above minimumScore, best first, and
// allows at most maxPerCompany per company so one employer can't fill the
// whole list. Jobs left out come back in later runs, since only jobs
// already in the sheet are skipped.
export function scoreAll(jobs, minimumScore = 55, maxPerCompany = 3) {
  const scored = jobs
    .map(scoreAndTag)
    .filter((j) => j.matchScore >= minimumScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  const perCompany = new Map();
  return scored.filter((j) => {
    const key = (j.company || "unknown").toLowerCase();
    const count = perCompany.get(key) || 0;
    if (count >= maxPerCompany) return false;
    perCompany.set(key, count + 1);
    return true;
  });
}
