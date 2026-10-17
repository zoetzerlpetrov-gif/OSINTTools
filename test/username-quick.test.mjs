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
  assert.equal(QUICK_USERNAME_PROVIDER_NAMES.length, 10);
  assert.ok(QUICK_USERNAME_PROVIDER_NAMES.includes("GitHub"));
  assert.ok(QUICK_USERNAME_PROVIDER_NAMES.includes("Wikipedia"));
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
