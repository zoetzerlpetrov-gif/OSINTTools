import { isPublicIp } from "../validation.mjs";

const RDAP_BASE = "https://rdap.org";

function requestHeaders() {
  return {
    accept: "application/rdap+json, application/json",
    "user-agent": process.env.APP_USER_AGENT || "OSINTTools/0.2"
  };
}

function compactEvents(events = []) {
  return events
    .filter(event => event?.eventAction && event?.eventDate)
    .map(event => ({ action: event.eventAction, date: event.eventDate }));
}

function compactNameservers(nameservers = []) {
  return nameservers
    .map(item => item?.ldhName || item?.unicodeName)
    .filter(Boolean);
}

export function normalizeRdap(payload, queryUrl) {
  return {
    provider: "RDAP",
    source: "registration-data",
    confidence: "registry-response",
    observedAt: new Date().toISOString(),
    url: queryUrl,
    note: "Registration data returned by the authoritative RDAP service. Contact cards are intentionally omitted.",
    details: {
      objectClass: payload.objectClassName || null,
      handle: payload.handle || null,
      name: payload.ldhName || payload.unicodeName || payload.name || null,
      status: Array.isArray(payload.status) ? payload.status : [],
      country: payload.country || null,
      startAddress: payload.startAddress || null,
      endAddress: payload.endAddress || null,
      ipVersion: payload.ipVersion || null,
      type: payload.type || null,
      parentHandle: payload.parentHandle || null,
      nameservers: compactNameservers(payload.nameservers),
      events: compactEvents(payload.events)
    }
  };
}

export async function fetchRdap(type, value, fetchImpl = fetch) {
  if (!["domain", "ip"].includes(type)) throw new Error("Unsupported RDAP resource type");
  if (type === "ip" && !isPublicIp(value)) throw new Error("RDAP lookup requires a public IP address");
  const queryUrl = `${RDAP_BASE}/${type}/${encodeURIComponent(value)}`;
  const response = await fetchImpl(queryUrl, {
    headers: requestHeaders(),
    redirect: "follow",
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 404) {
    return {
      provider: "RDAP",
      source: "registration-data",
      confidence: "not-found",
      observedAt: new Date().toISOString(),
      url: queryUrl,
      note: "No authoritative RDAP record was found for this resource.",
      details: {}
    };
  }
  if (!response.ok) throw new Error(`RDAP service returned ${response.status}`);
  return normalizeRdap(await response.json(), queryUrl);
}
