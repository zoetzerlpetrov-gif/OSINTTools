import test from "node:test";
import assert from "node:assert/strict";
import { buildUsernameCandidates, USERNAME_CATEGORIES, USERNAME_PROVIDERS } from "../src/providers/username-catalog.mjs";

test("ships a broad categorized username provider catalog", () => {
  assert.equal(USERNAME_PROVIDERS.length, 89);
  assert.ok(USERNAME_CATEGORIES.length >= 15);
  assert.equal(new Set(USERNAME_PROVIDERS.map(provider => provider.name)).size, USERNAME_PROVIDERS.length);
});

test("builds valid candidate URLs without claiming account existence", () => {
  const candidates = buildUsernameCandidates("analista.test");
  assert.equal(candidates.length, USERNAME_PROVIDERS.length);
  for (const candidate of candidates) {
    assert.doesNotThrow(() => new URL(candidate.url));
    assert.equal(candidate.confidence, "candidate");
    assert.equal(candidate.verification, "not-checked");
  }
});

test("encodes a username before inserting it into provider URLs", () => {
  const [candidate] = buildUsernameCandidates("á_user");
  assert.match(candidate.url, /%C3%A1_user/);
});
