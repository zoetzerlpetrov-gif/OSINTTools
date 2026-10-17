import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectDomain, inspectIp } from "./connectors/dns.mjs";
import { fetchEmailBreaches, fetchPasswordRange } from "./connectors/hibp.mjs";
import { fetchRdap } from "./connectors/rdap.mjs";
import { fetchShodanHost } from "./connectors/shodan.mjs";
import { isPublicIp, normalizeSearchType, validateSha1Prefix, validateTerm } from "./validation.mjs";

const port = Number(process.env.PORT || 3000);
const root = fileURLToPath(new URL("../public", import.meta.url));
const buckets = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function securityHeaders() {
  return {
    "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin"
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { ...securityHeaders(), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new Error("Request body is too large");
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function allowRequest(request) {
  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now > current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

function usernameCandidates(username) {
  const encoded = encodeURIComponent(username);
  return [
    ["GitHub", `https://github.com/${encoded}`],
    ["Reddit", `https://www.reddit.com/user/${encoded}`],
    ["GitLab", `https://gitlab.com/${encoded}`],
    ["Keybase", `https://keybase.io/${encoded}`],
    ["Medium", `https://medium.com/@${encoded}`]
  ].map(([provider, url]) => ({ provider, url, confidence: "unverified", note: "Candidate URL only; existence and ownership have not been confirmed." }));
}

async function runSearch(type, value) {
  if (type === "domain") {
    const results = await Promise.allSettled([inspectDomain(value), fetchRdap("domain", value)]);
    return { type, value, findings: settledFindings(results) };
  }
  if (type === "ip") {
    if (!isPublicIp(value)) {
      return {
        type,
        value,
        findings: [
          await inspectIp(value),
          { provider: "Safety gate", confidence: "blocked", note: "Private, local, multicast, and reserved IP addresses are not sent to RDAP or Shodan." }
        ]
      };
    }
    const lookups = [inspectIp(value), fetchRdap("ip", value)];
    if (process.env.SHODAN_API_KEY) lookups.push(fetchShodanHost(value));
    const results = await Promise.allSettled(lookups);
    const findings = settledFindings(results);
    if (!process.env.SHODAN_API_KEY) {
      findings.push({ provider: "Shodan", confidence: "not-configured", note: "Configure SHODAN_API_KEY to add passive host observations. No active scan is performed." });
    }
    return { type, value, findings };
  }
  if (type === "username") return { type, value, findings: usernameCandidates(value) };
  if (type === "email") {
    const domain = value.split("@")[1];
    return {
      type,
      value,
      findings: [
        { provider: "Input validation", confidence: "confirmed", note: "Email syntax is valid." },
        { provider: "Domain pivot", confidence: "confirmed", value: domain, action: "Run a domain search for DNS context." },
        { provider: "HIBP", confidence: "not-queried", note: process.env.HIBP_API_KEY ? "Use Email Exposure to query known breaches." : "Configure HIBP_API_KEY to enable breach lookup." }
      ]
    };
  }
  return {
    type,
    value,
    findings: [{ provider: "Safety gate", confidence: "manual-review", note: "Automated person or phone enumeration is disabled in the MVP. Record a lawful purpose and authorization before enabling a connector." }]
  };
}

function settledFindings(results) {
  return results.map(result => result.status === "fulfilled"
    ? result.value
    : { provider: "Connector", confidence: "unavailable", note: result.reason?.message || "Connector unavailable" });
}

async function serveStatic(pathname, response) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = join(root, safePath);
  if (!fullPath.startsWith(root)) return sendJson(response, 404, { error: "Not found" });
  try {
    const content = await readFile(fullPath);
    response.writeHead(200, { ...securityHeaders(), "content-type": mimeTypes[extname(fullPath)] || "application/octet-stream", "cache-control": "no-cache" });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (request, response) => {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/") && !allowRequest(request)) return sendJson(response, 429, { error: "Rate limit exceeded", requestId });

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { status: "ok", version: "0.2.0", connectors: { passwordExposure: true, emailExposure: Boolean(process.env.HIBP_API_KEY), dns: true, rdap: true, shodan: Boolean(process.env.SHODAN_API_KEY) } });
    }

    if (request.method === "POST" && url.pathname === "/api/search") {
      const body = await readJson(request);
      const type = normalizeSearchType(body.type);
      const value = validateTerm(type, body.value);
      const result = await runSearch(type, value);
      return sendJson(response, 200, { requestId, observedAt: new Date().toISOString(), ...result });
    }

    if (request.method === "POST" && url.pathname === "/api/password-range") {
      const body = await readJson(request);
      const prefix = validateSha1Prefix(body.prefix);
      const range = await fetchPasswordRange(prefix);
      response.writeHead(200, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return response.end(range);
    }

    if (request.method === "POST" && url.pathname === "/api/email-exposure") {
      const body = await readJson(request);
      const email = validateTerm("email", body.email);
      const breaches = await fetchEmailBreaches(email);
      return sendJson(response, 200, { requestId, count: breaches.length, breaches });
    }

    if (request.method === "GET") return serveStatic(url.pathname, response);
    return sendJson(response, 405, { error: "Method not allowed", requestId });
  } catch (error) {
    const status = error.code === "CONNECTOR_NOT_CONFIGURED" ? 503 : 400;
    sendJson(response, status, { error: error.message || "Unexpected error", requestId });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`OSINTTools listening on http://127.0.0.1:${port}`);
});
