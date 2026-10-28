// scorer.js
// Decides which resume (config/cvMapping.json) fits a job and computes a 0-100 match score.
// A lightweight first-pass filter, not a human read of the posting.
// Always read the real posting before applying.

import { CV_CATEGORIES, DEFAULT_CV_KEY } from "./cvs.js";

// Seniority is judged from the TITLE only.
const SENIOR_SOFT = ["senior", "sr"];
const SENIOR_HARD = [
  "staff",
  "principal",
  "lead",
  "director",
  "head of",
  "vp",
  "manager",
  "architect",
];
const JUNIOR_WORDS = [
  "junior",
  "jr",
  "intern",
  "internship",
  "entry level",
  "entry-level",
  "graduate",
  "trainee",
];

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
  "devops",
  "sre",
  "site reliability",
  "cloud",
  "platform",
  "infrastructure",
];

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
  "researcher",
  "scientist",
  "technician",
  "developer relations",
  "advocate",
  "evangelist",
  "consultant",
  "specialist",
  "coordinator",
  "associate",
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
  "security engineer",
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
  "devops",
  "sre",
  "site reliability",
  "cloud",
  "aws",
  "kubernetes",
  "platform",
  "infrastructure",
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

  // Seniority, from the title only
  if (SENIOR_HARD.some((w) => hasTerm(title, w))) {
    score -= 25;
  } else if (SENIOR_SOFT.some((w) => hasTerm(title, w))) {
    score += 15;
  } else if (JUNIOR_WORDS.some((w) => hasTerm(title, w))) {
    score -= 10;
  } else {
    score += 25;
  }

  // Asks for 7+ years: probably too senior
  if (/\b(7|8|9|1\d)\s*\+?\s*(years|yrs)\b/.test(blob)) score -= 10;

  if ((job.description || "").length > 200) score += 10;
  if (job.employmentType) score += 10;

  // Title relevance
  const titleFitsStack = FIT_STACK_TITLE.some((w) => hasTerm(title, w));
  if (titleFitsStack) score += 10;
  if (!ROLE_WORDS.some((w) => hasTerm(title, w))) score -= 40;
  if (NON_DEV_TITLE.some((w) => hasTerm(title, w))) score -= 60;
  if (!titleFitsStack && WRONG_STACK_TITLE.some((w) => hasTerm(title, w))) {
    score -= 40;
  }
  // No core backend/cloud skill anywhere: can't pass on bonuses alone
  const coreHits = CORE_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  if (coreHits === 0) score = Math.min(score, 45);

  // Jobs in your priority country (Canada) rank higher. The bonus is set in
  // config/countries.json and attached by filterJobs().
  score += job.locationBonus || 0;

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
