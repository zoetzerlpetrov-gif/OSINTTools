import test from "node:test";
import assert from "node:assert/strict";
import { clearVerificationJobsForTest, createVerificationJob, getVerificationJob } from "../src/jobs/username-verification.mjs";
import { normalizeMaigretReport } from "../src/workers/maigret.mjs";

test("normalizes claimed profiles without raw page content", () => {
  const findings = normalizeMaigretReport({
    GitHub: {
      url_user: "https://github.com/analista",
      response_text: "raw page content",
      site: { tags: ["coding", "us"] },
      response_time_ms: 240
    }
  }, "analista");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verification, "claimed");
  assert.equal(findings[0].details.username, "analista");
  assert.equal(JSON.stringify(findings).includes("raw page content"), false);
});

test("runs verification jobs through the bounded queue", async () => {
  clearVerificationJobsForTest();
  const queued = createVerificationJob({
    username: "analista",
    purpose: "self-audit",
    maxSites: 10,
    tags: []
  }, async input => [{ provider: "Test", url: `https://example.com/${input.username}` }]);
  assert.equal(queued.status, "queued");
  await new Promise(resolve => setImmediate(resolve));
  const completed = getVerificationJob(queued.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.results.length, 1);
});

test("does not expose results before a job completes", () => {
  clearVerificationJobsForTest();
  const queued = createVerificationJob({
    username: "pending-user",
    purpose: "owned-brand",
    maxSites: 5,
    tags: []
  }, () => new Promise(() => {}));
  assert.equal(queued.results, undefined);
});
