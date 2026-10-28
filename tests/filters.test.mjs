import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkJobLocation,
  isRemoteJob,
  filterJobs,
  deduplicate,
} from "../lib/filters.js";

// A company career-page job (not a remote-only board).
const onsite = (location, extra = {}) => ({
  source: "greenhouse",
  title: "Backend Engineer",
  description: "",
  location,
  ...extra,
});
const ok = (job) => checkJobLocation(job).ok;

test("Canadian jobs pass whether remote or onsite", () => {
  for (const place of [
    "Toronto, ON",
    "Vancouver, British Columbia",
    "Montréal, Québec",
    "Remote - Canada",
    "Waterloo, Ontario, Canada",
    "Toronto or New York",
  ]) {
    assert.equal(ok(onsite(place)), true, place);
  }
});

test("US jobs pass only when remote", () => {
  assert.equal(ok(onsite("Remote - USA")), true);
  assert.equal(ok(onsite("United States", { source: "remotive" })), true);
  assert.equal(
    ok(onsite("US", { description: "This is a fully remote role." })),
    true,
  );
  assert.equal(ok(onsite("New York, United States")), false);
  assert.equal(ok(onsite("San Francisco, CA")), false);
});

test("remote jobs open worldwide or to North America pass", () => {
  for (const place of ["Remote", "Worldwide", "Anywhere", "Remote, AMER", "North America", ""]) {
    assert.equal(ok(onsite(place)), true, place || "(blank)");
  }
});

test("jobs tied to other countries or regions are dropped", () => {
  for (const place of [
    "Remote, EMEA",
    "Remote - Europe",
    "Berlin, Germany",
    "London, UK",
    "Lagos, Nigeria",
    "Remote - Latin America",
    "APAC",
  ]) {
    assert.equal(ok(onsite(place)), false, place);
  }
});

test("a location listing Canada among other places passes", () => {
  assert.equal(ok(onsite("Europe, USA, Canada, APAC", { source: "remotive" })), true);
});

test("'us' must match whole: 'Austin' and 'business' do not mean the US", () => {
  assert.equal(ok(onsite("Austin")), false);
});

test("remote-only boards are always remote, even with just a country name", () => {
  assert.equal(
    isRemoteJob({ source: "himalayas", location: "United States", title: "Dev" }),
    true,
  );
  assert.equal(isRemoteJob(onsite("Berlin, Germany")), false);
  assert.equal(
    isRemoteJob(onsite("", { description: "This is a fully remote role." })),
    true,
  );
});

test("filterJobs boosts Canada and flags US-only jobs", () => {
  const out = filterJobs([
    onsite("Toronto, ON"),
    onsite("Remote - USA"),
    onsite("Remote"),
    onsite("Remote, EMEA"),
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].inPriorityCountry, true);
  assert.ok(out[0].locationBonus > 0);
  assert.equal(out[1].locationRestricted, true);
  assert.equal(out[1].locationBonus, 0);
  assert.equal(out[2].locationRestricted, false);
});

test("deduplicate removes known links, repeats and jobs with no link", () => {
  const out = deduplicate(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    new Set(["a"]),
  );
  assert.deepEqual(
    out.map((j) => j.link),
    ["b", "c"],
  );
});
