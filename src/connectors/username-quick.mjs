const timeoutMs = 8_000;

const sources = [
  source("GitHub", "development", username => `https://api.github.com/users/${encodeURIComponent(username)}`, username => `https://github.com/${encodeURIComponent(username)}`, statusOnly),
  source("GitLab", "development", username => `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`, username => `https://gitlab.com/${encodeURIComponent(username)}`, exactUsernameList),
  source("Codeberg", "development", username => `https://codeberg.org/api/v1/users/${encodeURIComponent(username)}`, username => `https://codeberg.org/${encodeURIComponent(username)}`, statusOnly),
  source("Docker Hub", "development", username => `https://hub.docker.com/v2/users/${encodeURIComponent(username)}`, username => `https://hub.docker.com/u/${encodeURIComponent(username)}`, statusOnly),
  source("Hacker News", "community", username => `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`, username => `https://news.ycombinator.com/user?id=${encodeURIComponent(username)}`, nullableJson),
  source("DEV Community", "development", username => `https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`, username => `https://dev.to/${encodeURIComponent(username)}`, statusOnly),
  source("Reddit", "community", username => `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, username => `https://www.reddit.com/user/${encodeURIComponent(username)}/`, statusOnly),
  source("Chess.com", "gaming", username => `https://api.chess.com/pub/player/${encodeURIComponent(username)}`, username => `https://www.chess.com/member/${encodeURIComponent(username)}`, statusOnly),
  source("Lichess", "gaming", username => `https://lichess.org/api/user/${encodeURIComponent(username)}`, username => `https://lichess.org/@/${encodeURIComponent(username)}`, statusOnly),
  source("Wikipedia", "knowledge", username => `https://en.wikipedia.org/w/api.php?action=query&list=allusers&aufrom=${encodeURIComponent(username)}&aulimit=1&format=json`, username => `https://en.wikipedia.org/wiki/User:${encodeURIComponent(username)}`, exactWikipediaUser)
];

export const QUICK_USERNAME_PROVIDER_NAMES = Object.freeze(sources.map(item => item.name));

function source(name, category, endpoint, profile, classify) {
  return Object.freeze({ name, category, endpoint, profile, classify });
}

function baseStatus(response) {
  if (response.status === 404 || response.status === 410) return "not-found";
  if (response.status === 401 || response.status === 403 || response.status === 429) return "blocked";
  if (response.status >= 500) return "error";
  if (!response.ok) return "inconclusive";
  return null;
}

async function statusOnly(response) {
  return baseStatus(response) || "found";
}

async function exactUsernameList(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const payload = await response.json();
  if (!Array.isArray(payload)) return "inconclusive";
  return payload.some(item => String(item?.username || "").toLowerCase() === username.toLowerCase()) ? "found" : "not-found";
}

async function nullableJson(response) {
  const status = baseStatus(response);
  if (status) return status;
  return await response.json() ? "found" : "not-found";
}

async function exactWikipediaUser(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const users = (await response.json())?.query?.allusers;
  if (!Array.isArray(users)) return "inconclusive";
  return users.some(item => String(item?.name || "").toLowerCase() === username.toLowerCase()) ? "found" : "not-found";
}

function noteFor(status) {
  if (status === "found") return "The provider returned its expected account response. Review the profile before attributing identity.";
  if (status === "not-found") return "The provider returned its expected missing-account response at the observation time.";
  if (status === "blocked") return "The provider blocked or rate-limited this automated check. No existence conclusion was made.";
  if (status === "error") return "The provider or network returned a temporary error. Retry later.";
  return "The response could not reliably distinguish an existing account from a missing one.";
}

async function verifySource(item, username, fetchImpl) {
  const observedAt = new Date().toISOString();
  let verification = "error";
  let httpStatus = null;
  try {
    const response = await fetchImpl(item.endpoint(username), {
      headers: {
        "accept": "application/json",
        "user-agent": process.env.APP_USER_AGENT || "OSINTTools/0.5 (authorized self-audit)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    httpStatus = response.status;
    verification = await item.classify(response, username);
  } catch (error) {
    verification = error?.name === "TimeoutError" || error?.name === "AbortError" ? "error" : "error";
  }
  return {
    provider: item.name,
    category: item.category,
    url: item.profile(username),
    confidence: verification === "found" || verification === "not-found" ? "provider-response" : "unavailable",
    verification,
    observedAt,
    note: noteFor(verification),
    details: { method: "provider-api", httpStatus }
  };
}

export async function verifyUsernameQuick(username, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const selected = sources.slice(0, Math.min(sources.length, Math.max(1, Number(options.maxSites) || sources.length)));
  const results = [];
  const concurrency = 4;
  let next = 0;
  async function worker() {
    while (next < selected.length) {
      const item = selected[next++];
      results.push(await verifySource(item, username, fetchImpl));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
  return results.sort((a, b) => QUICK_USERNAME_PROVIDER_NAMES.indexOf(a.provider) - QUICK_USERNAME_PROVIDER_NAMES.indexOf(b.provider));
}
