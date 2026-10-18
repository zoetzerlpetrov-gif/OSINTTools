import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteMaigretJob, getRemoteMaigretJob, signWorkerPayload } from "../src/connectors/maigret-remote.mjs";

const secret = "0123456789abcdef0123456789abcdef";
const nonce = "12345678-1234-1234-1234-123456789abc";

test("creates deterministic HMAC signatures", () => {
  assert.equal(
    signWorkerPayload(secret, "1700000000", nonce, '{"username":"analista"}'),
    "2b9b095f21d54a95785acb7991b3019698f5c7b8d4191b45d464d1b4a8c24242"
  );
});

test("signs and submits a remote Maigret job", async () => {
  let captured;
  const result = await createRemoteMaigretJob({ username: "analista" }, {
    baseUrl: "https://worker.example",
    secret,
    now: () => 1_700_000_000_000,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 202, json: async () => ({ id: "job-id", status: "queued" }) };
    }
  });
  assert.equal(captured.url, "https://worker.example/v1/jobs");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers["x-osinttools-timestamp"], "1700000000");
  assert.match(captured.options.headers["x-osinttools-nonce"], /^[0-9a-f-]{36}$/);
  assert.equal(captured.options.headers["x-osinttools-signature"], signWorkerPayload(secret, "1700000000", captured.options.headers["x-osinttools-nonce"], captured.options.body));
  assert.equal(result.status, "queued");
});

test("signs job status reads with an empty body", async () => {
  let captured;
  await getRemoteMaigretJob("123", {
    baseUrl: "http://localhost:8080/",
    secret,
    now: () => 1_700_000_000_000,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200, json: async () => ({ status: "running" }) };
    }
  });
  assert.equal(captured.url, "http://localhost:8080/v1/jobs/123");
  assert.equal(captured.options.body, undefined);
  assert.equal(captured.options.headers["x-osinttools-signature"], signWorkerPayload(secret, "1700000000", captured.options.headers["x-osinttools-nonce"], ""));
});

test("rejects an insecure non-local worker URL", async () => {
  await assert.rejects(
    () => createRemoteMaigretJob({}, { baseUrl: "http://worker.example", secret }),
    /HTTPS/
  );
});
