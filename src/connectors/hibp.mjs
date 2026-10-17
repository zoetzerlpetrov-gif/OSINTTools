const HIBP_BASE = "https://haveibeenpwned.com/api/v3";
const PASSWORDS_BASE = "https://api.pwnedpasswords.com/range";

function requestHeaders(extra = {}) {
  return {
    "user-agent": process.env.APP_USER_AGENT || "OSINTTools/0.1",
    ...extra
  };
}

export async function fetchPasswordRange(prefix) {
  const response = await fetch(`${PASSWORDS_BASE}/${prefix}`, {
    headers: requestHeaders({ "Add-Padding": "true" }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`HIBP password service returned ${response.status}`);
  return response.text();
}

export async function fetchEmailBreaches(email) {
  const apiKey = process.env.HIBP_API_KEY;
  if (!apiKey) {
    const error = new Error("HIBP email lookup is not configured");
    error.code = "CONNECTOR_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${HIBP_BASE}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`, {
    headers: requestHeaders({ "hibp-api-key": apiKey }),
    signal: AbortSignal.timeout(10000)
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`HIBP email service returned ${response.status}`);
  return response.json();
}
