import { isPublicIp } from "../validation.mjs";

const SHODAN_BASE = "https://api.shodan.io";

export function normalizeShodan(payload) {
  return {
    provider: "Shodan",
    source: "passive-host-intelligence",
    confidence: "provider-observation",
    observedAt: new Date().toISOString(),
    note: "Previously observed host metadata. OSINTTools does not scan or connect to the target.",
    details: {
      ip: payload.ip_str || null,
      hostnames: Array.isArray(payload.hostnames) ? payload.hostnames : [],
      domains: Array.isArray(payload.domains) ? payload.domains : [],
      ports: Array.isArray(payload.ports) ? payload.ports : [],
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      organization: payload.org || null,
      isp: payload.isp || null,
      asn: payload.asn || null,
      operatingSystem: payload.os || null,
      country: payload.country_name || null,
      countryCode: payload.country_code || null,
      city: payload.city || null,
      lastProviderUpdate: payload.last_update || null
    }
  };
}

export async function fetchShodanHost(ip, fetchImpl = fetch) {
  if (!isPublicIp(ip)) throw new Error("Shodan lookup requires a public IP address");
  const apiKey = process.env.SHODAN_API_KEY;
  if (!apiKey) {
    const error = new Error("Shodan lookup is not configured");
    error.code = "CONNECTOR_NOT_CONFIGURED";
    throw error;
  }
  const url = `${SHODAN_BASE}/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(apiKey)}&minify=true`;
  const response = await fetchImpl(url, {
    headers: { "user-agent": process.env.APP_USER_AGENT || "OSINTTools/0.2" },
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 404) {
    return {
      provider: "Shodan",
      source: "passive-host-intelligence",
      confidence: "not-found",
      observedAt: new Date().toISOString(),
      note: "Shodan has no observation for this IP address.",
      details: { ip }
    };
  }
  if (!response.ok) throw new Error(`Shodan service returned ${response.status}`);
  return normalizeShodan(await response.json());
}
