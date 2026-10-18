import { createHmac, randomUUID } from "node:crypto";

const requestTimeoutMs = 10_000;

function configuration(options = {}) {
  const baseUrl = options.baseUrl || process.env.MAIGRET_WORKER_URL;
  const secret = options.secret || process.env.MAIGRET_WORKER_SECRET;
  if (!baseUrl || !secret) {
    const error = new Error("El trabajador Maigret remoto no está configurado");
    error.code = "CONNECTOR_NOT_CONFIGURED";
    throw error;
  }
  if (secret.length < 32) throw new Error("MAIGRET_WORKER_SECRET debe contener al menos 32 caracteres");
  const url = new URL(baseUrl);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !local) throw new Error("MAIGRET_WORKER_URL debe usar HTTPS");
  return { baseUrl: url.toString().replace(/\/$/, ""), secret };
}

export function isRemoteMaigretConfigured() {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}

export function signWorkerPayload(secret, timestamp, nonce, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

async function workerRequest(path, { method = "GET", payload, fetchImpl = fetch, now = Date.now, ...options } = {}) {
  const { baseUrl, secret } = configuration(options);
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = String(Math.floor(now() / 1000));
  const nonce = randomUUID();
  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-osinttools-timestamp": timestamp,
        "x-osinttools-nonce": nonce,
        "x-osinttools-signature": signWorkerPayload(secret, timestamp, nonce, body)
      },
      body: body || undefined,
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch {
    const error = new Error("No fue posible contactar al trabajador Maigret");
    error.code = "REMOTE_CONNECTOR_ERROR";
    throw error;
  }
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error || `El trabajador Maigret respondió HTTP ${response.status}`);
    error.code = "REMOTE_CONNECTOR_ERROR";
    throw error;
  }
  return responseBody;
}

export function createRemoteMaigretJob(input, options = {}) {
  return workerRequest("/v1/jobs", { ...options, method: "POST", payload: input });
}

export function getRemoteMaigretJob(id, options = {}) {
  return workerRequest(`/v1/jobs/${encodeURIComponent(id)}`, options);
}
