const timeoutMs = 8_000;

const sources = [
  source("GitHub", "development", username => `https://api.github.com/users/${encodeURIComponent(username)}`, username => `https://github.com/${encodeURIComponent(username)}`, exactJsonField("login")),
  source("GitLab", "development", username => `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`, username => `https://gitlab.com/${encodeURIComponent(username)}`, exactUsernameList),
  source("Codeberg", "development", username => `https://codeberg.org/api/v1/users/${encodeURIComponent(username)}`, username => `https://codeberg.org/${encodeURIComponent(username)}`, exactJsonField("login")),
  source("Docker Hub", "development", username => `https://hub.docker.com/v2/users/${encodeURIComponent(username)}`, username => `https://hub.docker.com/u/${encodeURIComponent(username)}`, exactJsonAnyField(["username", "orgname"])),
  source("Hacker News", "community", username => `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`, username => `https://news.ycombinator.com/user?id=${encodeURIComponent(username)}`, nullableExactJsonField("id")),
  source("DEV Community", "development", username => `https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`, username => `https://dev.to/${encodeURIComponent(username)}`, exactJsonField("username")),
  source("Reddit", "community", username => `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, username => `https://www.reddit.com/user/${encodeURIComponent(username)}/`, exactNestedJsonField(["data", "name"])),
  source("Chess.com", "gaming", username => `https://api.chess.com/pub/player/${encodeURIComponent(username)}`, username => `https://www.chess.com/member/${encodeURIComponent(username)}`, exactJsonField("username")),
  source("Lichess", "gaming", username => `https://lichess.org/api/user/${encodeURIComponent(username)}`, username => `https://lichess.org/@/${encodeURIComponent(username)}`, exactJsonField("username")),
  source("Wikipedia", "knowledge", username => `https://en.wikipedia.org/w/api.php?action=query&list=allusers&aufrom=${encodeURIComponent(username)}&aulimit=1&format=json`, username => `https://en.wikipedia.org/wiki/User:${encodeURIComponent(username)}`, exactWikipediaUser),
  source("Keybase", "community", username => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(username)}`, username => `https://keybase.io/${encodeURIComponent(username)}`, exactKeybaseUser),
  source("Codewars", "development", username => `https://www.codewars.com/api/v1/users/${encodeURIComponent(username)}`, username => `https://www.codewars.com/users/${encodeURIComponent(username)}`, exactCodewarsUser),
  source("Speedrun.com", "gaming", username => `https://www.speedrun.com/api/v1/users?lookup=${encodeURIComponent(username)}`, username => `https://www.speedrun.com/users/${encodeURIComponent(username)}`, exactSpeedrunUser),
  source("Bluesky", "social", username => `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(blueskyHandle(username))}`, username => `https://bsky.app/profile/${encodeURIComponent(blueskyHandle(username))}`, resolveBlueskyHandle),
  source("Scratch", "development", username => `https://api.scratch.mit.edu/users/${encodeURIComponent(username)}`, username => `https://scratch.mit.edu/users/${encodeURIComponent(username)}/`, exactJsonField("username")),
  source("Roblox", "gaming", username => `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`, username => `https://www.roblox.com/search/users?keyword=${encodeURIComponent(username)}`, exactRobloxUser)
];

export const QUICK_USERNAME_PROVIDER_NAMES = Object.freeze(sources.map(item => item.name));

function source(name, category, endpoint, profile, classify) {
  return Object.freeze({ name, category, endpoint, profile, classify });
}

function blueskyHandle(username) {
  return username.includes(".") ? username : `${username}.bsky.social`;
}

function baseStatus(response) {
  if (response.status === 404 || response.status === 410) return "not-found";
  if (response.status === 401 || response.status === 403 || response.status === 429) return "blocked";
  if (response.status >= 500) return "error";
  if (!response.ok) return "inconclusive";
  return null;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function normalized(value) {
  return String(value || "").toLowerCase();
}

function exactJsonField(field) {
  return async (response, username) => {
    const status = baseStatus(response);
    if (status) return status;
    const payload = await readJson(response);
    if (!payload || typeof payload !== "object") return "inconclusive";
    return normalized(payload[field]) === normalized(username) ? "found" : "inconclusive";
  };
}

function exactJsonAnyField(fields) {
  return async (response, username) => {
    const status = baseStatus(response);
    if (status) return status;
    const payload = await readJson(response);
    if (!payload || typeof payload !== "object") return "inconclusive";
    return fields.some(field => normalized(payload[field]) === normalized(username)) ? "found" : "inconclusive";
  };
}

function nullableExactJsonField(field) {
  return async (response, username) => {
    const status = baseStatus(response);
    if (status) return status;
    const payload = await readJson(response);
    if (payload === null) return "not-found";
    if (!payload || typeof payload !== "object") return "inconclusive";
    return normalized(payload[field]) === normalized(username) ? "found" : "inconclusive";
  };
}

function exactNestedJsonField(path) {
  return async (response, username) => {
    const status = baseStatus(response);
    if (status) return status;
    const payload = await readJson(response);
    const value = path.reduce((current, key) => current?.[key], payload);
    return normalized(value) === normalized(username) ? "found" : "inconclusive";
  };
}

async function exactUsernameList(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const payload = await readJson(response);
  if (!Array.isArray(payload)) return "inconclusive";
  return payload.some(item => normalized(item?.username) === normalized(username)) ? "found" : "not-found";
}

async function exactWikipediaUser(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const users = (await readJson(response))?.query?.allusers;
  if (!Array.isArray(users)) return "inconclusive";
  return users.some(item => normalized(item?.name) === normalized(username)) ? "found" : "not-found";
}

async function exactKeybaseUser(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const payload = await readJson(response);
  if (payload?.status?.code !== 0 || !Array.isArray(payload?.them)) return "inconclusive";
  if (payload.them[0] === null) return "not-found";
  return normalized(payload.them[0]?.basics?.username) === normalized(username) ? "found" : "inconclusive";
}

async function exactCodewarsUser(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const payload = await readJson(response);
  if (payload?.success === false && payload?.reason === "not found") return "not-found";
  return normalized(payload?.username) === normalized(username) ? "found" : "inconclusive";
}

async function exactSpeedrunUser(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const data = (await readJson(response))?.data;
  if (!Array.isArray(data)) return "inconclusive";
  return data.some(item => normalized(item?.names?.international) === normalized(username)) ? "found" : "not-found";
}

async function resolveBlueskyHandle(response) {
  const payload = await readJson(response);
  if (response.status === 400 && payload?.error === "InvalidRequest") return "not-found";
  const status = baseStatus(response);
  if (status) return status;
  return typeof payload?.did === "string" && payload.did.startsWith("did:") ? "found" : "inconclusive";
}

async function exactRobloxUser(response, username) {
  const status = baseStatus(response);
  if (status) return status;
  const data = (await readJson(response))?.data;
  if (!Array.isArray(data)) return "inconclusive";
  return data.some(item => normalized(item?.name) === normalized(username)) ? "found" : "not-found";
}

function noteFor(status) {
  if (status === "found") return "La fuente devolvió una cuenta con el nombre solicitado. Revisa el perfil antes de atribuirle una identidad.";
  if (status === "not-found") return "La fuente devolvió su respuesta esperada para una cuenta inexistente en el momento de la consulta.";
  if (status === "blocked") return "La fuente bloqueó o limitó la consulta automatizada. No se determinó si la cuenta existe.";
  if (status === "error") return "La fuente o la red devolvió un error temporal. Intenta nuevamente más tarde.";
  return "La respuesta no permitió distinguir con fiabilidad entre una cuenta existente y una inexistente.";
}

async function verifySource(item, username, fetchImpl) {
  const observedAt = new Date().toISOString();
  let verification = "error";
  let httpStatus = null;
  try {
    const response = await fetchImpl(item.endpoint(username), {
      headers: {
        "accept": "application/json",
        "user-agent": process.env.APP_USER_AGENT || "OSINTTools/0.6 (authorized self-audit)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    httpStatus = response.status;
    verification = await item.classify(response, username);
  } catch {
    verification = "error";
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
