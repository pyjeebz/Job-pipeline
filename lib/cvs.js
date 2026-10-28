// cvs.js
// The CV categories from config/cvMapping.json. Everything that needs a CV
// file name or label (scorer, pipeline, Approve, dashboard) reads it here, so
// cvMapping.json is the only file to edit when your CVs change.

import { loadJson } from "./loadJson.js";

const cvMapping = loadJson(import.meta.url, "../config/cvMapping.json");

export const CV_CATEGORIES = Object.fromEntries(
  Object.entries(cvMapping).filter(
    ([k]) => !k.startsWith("_") && k !== "notes",
  ),
);

export const DEFAULT_CV_KEY =
  Object.entries(CV_CATEGORIES).find(([, v]) => v.isDefault)?.[0] ||
  Object.keys(CV_CATEGORIES)[0];

// The PDF for a CV key, falling back to the default CV for unknown keys
// (for example rows written before the CV list changed).
export function resumeFileFor(cvKey) {
  return (CV_CATEGORIES[cvKey] || CV_CATEGORIES[DEFAULT_CV_KEY]).resumeFile;
}

// { cvKey: "Backend CV", ... } for the dashboard.
export function cvLabels() {
  return Object.fromEntries(
    Object.entries(CV_CATEGORIES).map(([k, v]) => [k, v.label || k]),
  );
}
