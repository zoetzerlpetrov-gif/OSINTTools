import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, normalizeSearchType, validateSha1Prefix, validateTerm } from "../src/validation.mjs";

test("normalizes a supported search type", () => {
  assert.equal(normalizeSearchType(" EMAIL "), "email");
});

test("rejects an unsupported search type", () => {
  assert.throws(() => normalizeSearchType("password"), /Unsupported/);
});

test("normalizes email and domain values", () => {
  assert.equal(validateTerm("email", "Person@Example.COM"), "person@example.com");
  assert.equal(validateTerm("domain", "Example.COM."), "example.com");
});

test("rejects malformed indicators", () => {
  assert.throws(() => validateTerm("email", "not-an-email"));
  assert.throws(() => validateTerm("domain", "localhost"));
  assert.throws(() => validateTerm("ip", "999.2.3.4"));
});

test("accepts safe usernames", () => {
  assert.equal(validateTerm("username", "zoetzerl_petrov-01"), "zoetzerl_petrov-01");
});

test("validates a k-anonymity SHA-1 prefix", () => {
  assert.equal(validateSha1Prefix("abc12"), "ABC12");
  assert.throws(() => validateSha1Prefix("ABC123"));
});

test("detects public and private IP addresses", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("192.168.1.20"), false);
  assert.equal(isPublicIp("100.64.1.20"), false);
  assert.equal(isPublicIp("198.51.100.20"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("2001:db8::1"), false);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
});
