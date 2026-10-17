import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_OUTPUT_BYTES = 64 * 1024;

export function normalizeMaigretReport(report, username) {
  return Object.entries(report || {}).flatMap(([siteName, entry]) => {
    const url = entry?.url_user || entry?.url || entry?.site?.url_user || entry?.site?.url;
    if (!url) return [];
    return [{
      provider: siteName,
      category: "verified-username",
      url,
      confidence: "provider-claimed",
      verification: "claimed",
      observedAt: new Date().toISOString(),
      note: "Maigret observed a response pattern associated with an existing public profile. This does not prove identity ownership.",
      details: {
        username,
        tags: Array.isArray(entry?.site?.tags) ? entry.site.tags.slice(0, 12) : [],
        responseTimeMs: Number.isFinite(entry?.response_time_ms) ? entry.response_time_ms : null
      }
    }];
  });
}

export async function runMaigret({ username, maxSites = 25, tags = [] }, dependencies = {}) {
  const spawnImpl = dependencies.spawnImpl || spawn;
  const makeTemp = dependencies.makeTemp || (() => mkdtemp(join(tmpdir(), "osinttools-maigret-")));
  const readText = dependencies.readText || (path => readFile(path, "utf8"));
  const removeTemp = dependencies.removeTemp || (path => rm(path, { recursive: true, force: true }));
  const outputDir = await makeTemp();
  const executable = process.env.MAIGRET_PYTHON || "python3";
  const boundedSites = Math.min(50, Math.max(1, Number(maxSites) || 25));
  const args = [
    "-m", "maigret", username,
    "--json", "simple",
    "--folderoutput", outputDir,
    "--top-sites", String(boundedSites),
    "--timeout", "10",
    "--max-connections", "5",
    "--no-recursion",
    "--no-color"
  ];
  if (tags.length) args.push("--tags", tags.join(","));

  try {
    const execution = await executeProcess(spawnImpl, executable, args, outputDir);
    if (execution.code !== 0) {
      const error = new Error(`Maigret worker exited with code ${execution.code}: ${execution.stderr || "no diagnostic output"}`);
      error.code = "WORKER_FAILED";
      throw error;
    }
    const reportPath = join(outputDir, `report_${username}_simple.json`);
    const report = JSON.parse(await readText(reportPath));
    return normalizeMaigretReport(report, username).slice(0, boundedSites);
  } finally {
    await removeTemp(outputDir);
  }
}

function executeProcess(spawnImpl, executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGTERM");
      const error = new Error("Maigret worker exceeded the 120 second execution limit");
      error.code = "WORKER_TIMEOUT";
      reject(error);
    }, 120_000);

    child.stdout?.on("data", chunk => { if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk; });
    child.stderr?.on("data", chunk => { if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk; });
    child.once("error", error => {
      finished = true;
      clearTimeout(timer);
      error.code = error.code === "ENOENT" ? "WORKER_NOT_INSTALLED" : "WORKER_FAILED";
      reject(error);
    });
    child.once("close", code => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}
