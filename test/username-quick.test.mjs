import test from "node:test";
import assert from "node:assert/strict";
import { QUICK_USERNAME_PROVIDER_NAMES, verifyUsernameQuick } from "../src/connectors/username-quick.mjs";

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload
  };
}

test("quick verification exposes a bounded maintained provider set", () => {
  assert.equal(QUICK_USERNAME_PROVIDER_NAMES.length, 16);
  assert.ok(QUICK_USERNAME_PROVIDER_NAMES.includes("GitHub"));
  assert.ok(QUICK_USERNAME_PROVIDER_NAMES.includes("Wikipedia"));
  assert.ok(QUICK_USERNAME_PROVIDER_NAMES.includes("Bluesky"));
  assert.ok(QUICK_USERNAME_PROVIDER_NAMES.includes("Roblox"));
});

test("classifies provider-specific found and missing responses", async () => {
  const fetchImpl = async url => {
    if (url.includes("api.github.com")) return response(200, { login: "analista" });
    if (url.includes("gitlab.com/api")) return response(200, []);
    return response(404, {});
  };
  const findings = await verifyUsernameQuick("analista", { fetchImpl, maxSites: 3 });
  assert.deepEqual(findings.map(item => item.verification), ["found", "not-found", "not-found"]);
  assert.equal(findings[0].details.method, "provider-api");
});

test("keeps blocked checks separate from not found", async () => {
  const findings = await verifyUsernameQuick("analista", { fetchImpl: async () => response(429, {}), maxSites: 1 });
  assert.equal(findings[0].verification, "blocked");
  assert.equal(findings[0].confidence, "unavailable");
});

test("does not treat a generic successful or HTML response as a found account", async () => {
  const findings = await verifyUsernameQuick("analista", {
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("HTML"); } }),
    maxSites: 1
  });
  assert.equal(findings[0].verification, "inconclusive");
});

test("recognizes Docker Hub organization accounts", async () => {
  const fetchImpl = async url => {
    if (url.includes("hub.docker.com")) return response(200, { orgname: "analista" });
    return response(404, {});
  };
  const findings = await verifyUsernameQuick("analista", { fetchImpl, maxSites: 4 });
  assert.equal(findings[3].verification, "found");
});

test("classifies provider-specific not-found payloads", async () => {
  const payloads = [
    { status: { code: 0 }, them: [null] },
    { success: false, reason: "not found" },
    { data: [] },
    { error: "InvalidRequest", message: "Unable to resolve handle" }
  ];
  let call = 0;
  const fetchImpl = async url => {
    if (url.includes("keybase")) return response(200, payloads[0]);
    if (url.includes("codewars")) return response(200, payloads[1]);
    if (url.includes("speedrun")) return response(200, payloads[2]);
    if (url.includes("bsky")) return response(400, payloads[3]);
    call += 1;
    return response(404, {});
  };
  const findings = await verifyUsernameQuick("analista", { fetchImpl, maxSites: 14 });
  assert.equal(call, 10);
  assert.deepEqual(findings.slice(10, 14).map(item => item.verification), ["not-found", "not-found", "not-found", "not-found"]);
});
