import test from "node:test";
import assert from "node:assert/strict";
import { fetchRdap, normalizeRdap } from "../src/connectors/rdap.mjs";
import { fetchShodanHost, normalizeShodan } from "../src/connectors/shodan.mjs";

test("normalizes RDAP without exposing entity contact cards", () => {
  const finding = normalizeRdap({
    objectClassName: "domain",
    ldhName: "example.com",
    status: ["active"],
    entities: [{ vcardArray: ["vcard", [["email", {}, "text", "person@example.com"]]] }],
    nameservers: [{ ldhName: "ns1.example.com" }],
    events: [{ eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" }]
  }, "https://rdap.org/domain/example.com");

  assert.equal(finding.details.name, "example.com");
  assert.deepEqual(finding.details.nameservers, ["ns1.example.com"]);
  assert.equal(JSON.stringify(finding).includes("person@example.com"), false);
});

test("handles a missing RDAP record", async () => {
  const finding = await fetchRdap("domain", "missing.example", async () => ({ status: 404, ok: false }));
  assert.equal(finding.confidence, "not-found");
});

test("blocks RDAP for private IP addresses before any request", async () => {
  await assert.rejects(
    () => fetchRdap("ip", "192.168.1.10", async () => { throw new Error("must not fetch"); }),
    /public IP/
  );
});

test("normalizes only compact Shodan host metadata", () => {
  const finding = normalizeShodan({
    ip_str: "8.8.8.8",
    ports: [53, 443],
    org: "Example Org",
    data: [{ data: "raw service banner" }]
  });
  assert.deepEqual(finding.details.ports, [53, 443]);
  assert.equal(JSON.stringify(finding).includes("raw service banner"), false);
});

test("blocks Shodan for private IP addresses before configuration checks", async () => {
  await assert.rejects(() => fetchShodanHost("192.168.1.10", async () => { throw new Error("must not fetch"); }), /public IP/);
});

test("requires explicit Shodan configuration", async () => {
  const previous = process.env.SHODAN_API_KEY;
  delete process.env.SHODAN_API_KEY;
  try {
    await assert.rejects(() => fetchShodanHost("8.8.8.8"), error => error.code === "CONNECTOR_NOT_CONFIGURED");
  } finally {
    if (previous === undefined) delete process.env.SHODAN_API_KEY;
    else process.env.SHODAN_API_KEY = previous;
  }
});
