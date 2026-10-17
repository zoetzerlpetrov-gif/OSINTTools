import crypto from "node:crypto";
import { runMaigret } from "../workers/maigret.mjs";

const jobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 100;
let queue = Promise.resolve();

function cleanupJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.updatedAtMs < cutoff) jobs.delete(id);
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    username: job.username,
    purpose: job.purpose,
    maxSites: job.maxSites,
    tags: job.tags,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    results: job.status === "completed" ? job.results : undefined,
    error: job.status === "failed" ? job.error : undefined
  };
}

export function createVerificationJob(input, runner = runMaigret) {
  cleanupJobs();
  if (jobs.size >= MAX_JOBS) throw new Error("Verification job capacity reached");
  const now = new Date();
  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    username: input.username,
    purpose: input.purpose,
    maxSites: input.maxSites,
    tags: input.tags,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime(),
    results: []
  };
  jobs.set(job.id, job);

  queue = queue.then(async () => {
    job.status = "running";
    touch(job);
    try {
      job.results = await runner({ username: job.username, maxSites: job.maxSites, tags: job.tags });
      job.status = "completed";
    } catch (error) {
      job.status = "failed";
      job.error = error.code === "WORKER_NOT_INSTALLED"
        ? "Maigret is not installed in the configured Python environment"
        : error.message;
    }
    touch(job);
  });

  return publicJob(job);
}

export function getVerificationJob(id) {
  cleanupJobs();
  return publicJob(jobs.get(id));
}

function touch(job) {
  const now = new Date();
  job.updatedAt = now.toISOString();
  job.updatedAtMs = now.getTime();
}

export function clearVerificationJobsForTest() {
  jobs.clear();
  queue = Promise.resolve();
}
