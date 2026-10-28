import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMatchScore,
  pickCvVersion,
  requiredYears,
  scoreAll,
} from "../lib/scorer.js";

const skills =
  "We build Python services on AWS with Docker, Kubernetes, Terraform and PostgreSQL. ".repeat(
    4,
  );
const job = (title, extra = {}) => ({
  title,
  description: skills,
  employmentType: "FullTime",
  ...extra,
});
const MINIMUM = 55;

test("the roles you are targeting pass the minimum score", () => {
  for (const title of [
    "Backend Engineer",
    "Junior Python Developer",
    "Software Engineer, New Grad",
    "Associate Software Engineer",
    "Software Engineer I",
    "Infrastructure Engineer",
    "Cloud Platform Engineer",
    "Full-stack Developer",
    "Software Engineer",
  ]) {
    assert.ok(computeMatchScore(job(title)) >= MINIMUM, title);
  }
});

test("jobs that are not a fit fall below the minimum score", () => {
  for (const title of [
    "Support Engineer (EMEA)",
    "Developer Relations Engineer",
    "Senior Backend Engineer",
    "Sr. Software Engineer",
    "Software Engineer III",
    "Software Engineer 3, Identity",
    "Security Engineer, Application Security",
    "Associate Technical Services Engineer",
    "Lead Infrastructure Engineer",
    "DevOps Engineer",
    "Site Reliability Engineer",
    "Software Engineering Intern",
    ".NET Developer",
    "Java Engineer",
    "Shopify Developer",
    "Salesforce Engineer III",
    "React Native Developer",
    "Frontend Engineer",
    "Machine Learning Engineer",
    "Staff Backend Engineer",
  ]) {
    assert.ok(computeMatchScore(job(title)) < MINIMUM, title);
  }
});

test("postings asking for more than 3 years drop out", () => {
  const asks = (n) =>
    job("Backend Engineer", {
      description: `${skills} You have ${n}+ years of professional experience.`,
    });
  assert.ok(computeMatchScore(asks(2)) >= MINIMUM);
  assert.ok(computeMatchScore(asks(3)) >= MINIMUM);
  assert.ok(computeMatchScore(asks(4)) < MINIMUM);
  assert.ok(computeMatchScore(asks(7)) < MINIMUM);
});

test("requiredYears reads the largest experience requirement", () => {
  assert.equal(requiredYears("5+ years of experience with Go"), 5);
  assert.equal(requiredYears("2-4 years of professional experience"), 2);
  assert.equal(
    requiredYears("Minimum of 4 years of relevant experience; 1+ year AWS experience"),
    4,
  );
  assert.equal(requiredYears("Founded 10 years ago. Great team."), null);
});

test("entry-level titles rank above plain titles", () => {
  const light = { description: "Python services. ".repeat(20) };
  assert.ok(
    computeMatchScore(job("Junior Software Engineer", light)) >
      computeMatchScore(job("Software Engineer", light)),
  );
});

test("a fitting stack word in the title outweighs a wrong-stack word", () => {
  assert.ok(computeMatchScore(job("Backend Engineer (Python, Java)")) >= MINIMUM);
});

test("jobs in Canada get the location bonus", () => {
  const light = { description: "Python services. ".repeat(20) };
  const base = computeMatchScore(job("Software Engineer", light));
  const inCanada = computeMatchScore(
    job("Software Engineer", { ...light, locationBonus: 10 }),
  );
  assert.ok(inCanada > base);
});

test("the title decides which CV is used", () => {
  assert.equal(pickCvVersion(job("Infrastructure Engineer")).cvKey, "infrastructure");
  assert.equal(pickCvVersion(job("Platform Engineer")).cvKey, "infrastructure");
  assert.equal(pickCvVersion(job("Python Backend Developer")).cvKey, "backend");
  assert.equal(pickCvVersion(job("Full Stack Developer")).cvKey, "fullstack");
  assert.equal(pickCvVersion(job("Software Engineer")).cvKey, "fullstack");
});

test("a clear title is never flagged for manual CV review", () => {
  assert.equal(
    pickCvVersion(job("Junior Backend Developer")).needsReview,
    false,
  );
});

test("words must match whole: 'awsome' is not 'aws'", () => {
  const j = job("Software Engineer", {
    description: "An awsome team building things in COBOL. ".repeat(20),
  });
  assert.ok(computeMatchScore(j) < MINIMUM);
});

test("jobs with none of your core skills cannot pass on bonuses alone", () => {
  const j = job("Software Engineer", {
    description: "We build things in COBOL. ".repeat(20),
  });
  assert.ok(computeMatchScore(j) < MINIMUM);
});

test("one company cannot fill the list: at most 3 per company", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    job("Backend Engineer", { company: "supabase", link: "l" + i }),
  );
  assert.equal(scoreAll(many, MINIMUM).length, 3);
});

test("results come back best match first", () => {
  const list = [
    job("Software Engineer", { company: "a" }),
    job("Infrastructure Engineer", { company: "b" }),
  ];
  const scores = scoreAll(list, MINIMUM).map((j) => j.matchScore);
  assert.deepEqual(
    scores,
    [...scores].sort((x, y) => y - x),
  );
});
