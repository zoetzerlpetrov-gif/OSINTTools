const state = {
  currentResult: null,
  findings: JSON.parse(localStorage.getItem("osinttools.case") || "[]"),
  usernameQuickVerificationEnabled: false,
  quickVerificationProviders: 0
};

const elements = {
  searchForm: document.querySelector("#search-form"),
  searchType: document.querySelector("#search-type"),
  searchValue: document.querySelector("#search-value"),
  results: document.querySelector("#results"),
  resultMeta: document.querySelector("#result-meta"),
  resultTools: document.querySelector("#result-tools"),
  categoryFilter: document.querySelector("#category-filter"),
  statusFilter: document.querySelector("#status-filter"),
  visibleCount: document.querySelector("#visible-count"),
  verificationForm: document.querySelector("#verification-form"),
  verificationPurpose: document.querySelector("#verification-purpose"),
  verificationLimit: document.querySelector("#verification-limit"),
  verificationAuthorization: document.querySelector("#verification-authorization"),
  verificationSubmit: document.querySelector("#verification-submit"),
  verificationStatus: document.querySelector("#verification-status"),
  saveResult: document.querySelector("#save-result"),
  exportCase: document.querySelector("#export-case"),
  clearCase: document.querySelector("#clear-case"),
  caseName: document.querySelector("#case-name"),
  findingCount: document.querySelector("#finding-count"),
  sourceCount: document.querySelector("#source-count"),
  passwordForm: document.querySelector("#password-form"),
  passwordValue: document.querySelector("#password-value"),
  passwordResult: document.querySelector("#password-result"),
  systemStatus: document.querySelector("#system-status")
};

const placeholders = {
  email: "analista@example.com",
  username: "nombre_de_usuario",
  domain: "example.com",
  ip: "8.8.8.8",
  name: "Nombre Apellido",
  phone: "+525500000000"
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderFinding(finding) {
  const provider = escapeHtml(finding.provider || "Fuente");
  const status = finding.verification || "observed";
  const statusLabels = { "not-checked": "PENDIENTE", found: "ENCONTRADO", "not-found": "NO ENCONTRADO", blocked: "BLOQUEADO", inconclusive: "INCONCLUSO", error: "ERROR", claimed: "REPORTADO" };
  const confidence = escapeHtml(statusLabels[status] || finding.confidence || "OBSERVADO");
  const note = finding.note ? `<p>${escapeHtml(finding.note)}</p>` : "";
  const link = finding.url ? `<p><a href="${escapeHtml(finding.url)}" target="_blank" rel="noopener noreferrer">Abrir perfil o fuente candidata</a></p>` : "";
  const detailValue = finding.details || finding.records || finding.hostnames || finding.value;
  const details = detailValue ? `<pre>${escapeHtml(JSON.stringify(detailValue, null, 2))}</pre>` : "";
  const category = escapeHtml(finding.category || "other");
  return `<article class="finding" data-category="${category}" data-status="${escapeHtml(status)}"><div class="finding-head"><strong>${provider}</strong><span class="confidence status-${escapeHtml(status)}">${confidence}</span></div>${note}${link}${details}</article>`;
}

function renderResult(result) {
  state.currentResult = result;
  elements.saveResult.disabled = false;
  elements.resultMeta.textContent = `${result.type} · ${new Date(result.observedAt).toLocaleString()}`;
  elements.results.className = "finding-grid";
  elements.results.innerHTML = result.findings.map(renderFinding).join("") || '<p class="muted">No se encontraron datos.</p>';
  configureResultTools(result);
  configureVerification(result);
}

function configureResultTools(result) {
  const categories = result.catalog?.categories || [];
  elements.resultTools.hidden = categories.length === 0;
  elements.categoryFilter.innerHTML = '<option value="all">Todas las categorías</option>' + categories
    .map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  elements.categoryFilter.value = "all";
  elements.statusFilter.value = "all";
  updateVisibleCount();
}

function configureVerification(result) {
  const isUsername = result.type === "username";
  elements.verificationForm.hidden = !isUsername;
  if (!isUsername) return;
  elements.verificationSubmit.disabled = !state.usernameQuickVerificationEnabled;
  elements.verificationLimit.max = String(state.quickVerificationProviders || 10);
  elements.verificationLimit.value = String(state.quickVerificationProviders || 10);
  elements.verificationStatus.textContent = state.usernameQuickVerificationEnabled
    ? `${state.quickVerificationProviders} fuentes compatibles con verificación inmediata. Las demás permanecerán pendientes.`
    : "La verificación rápida no está disponible.";
}

function renderError(message) {
  elements.resultTools.hidden = true;
  elements.results.className = "empty-state";
  elements.results.innerHTML = `<p>${escapeHtml(message)}</p>`;
  elements.resultMeta.textContent = "Consulta fallida";
}

function updateVisibleCount() {
  if (!state.currentResult?.catalog) return;
  const selected = elements.categoryFilter.value;
  const selectedStatus = elements.statusFilter.value;
  const cards = [...elements.results.querySelectorAll(".finding")];
  let visible = 0;
  for (const card of cards) {
    const categoryMatches = selected === "all" || card.dataset.category === selected;
    const statusMatches = selectedStatus === "all" || card.dataset.status === selectedStatus;
    const show = categoryMatches && statusMatches;
    card.hidden = !show;
    if (show) visible += 1;
  }
  const counts = cards.reduce((acc, card) => { acc[card.dataset.status] = (acc[card.dataset.status] || 0) + 1; return acc; }, {});
  elements.visibleCount.textContent = `${visible} de ${cards.length} · encontrados ${counts.found || 0} · no encontrados ${counts["not-found"] || 0} · pendientes ${counts["not-checked"] || 0}`;
}

elements.categoryFilter.addEventListener("change", updateVisibleCount);
elements.statusFilter.addEventListener("change", updateVisibleCount);

elements.verificationForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.currentResult || state.currentResult.type !== "username") return;
  elements.verificationSubmit.disabled = true;
  elements.verificationStatus.textContent = "Consultando fuentes compatibles…";
  try {
    const result = await postJson("/api/username/verify-quick", {
      username: state.currentResult.value,
      purpose: elements.verificationPurpose.value,
      maxSites: Number(elements.verificationLimit.value),
      authorizationAcknowledged: elements.verificationAuthorization.checked,
      tags: []
    });
    const replacements = new Map(result.findings.map(finding => [finding.provider, finding]));
    const findings = state.currentResult.findings.map(finding => replacements.get(finding.provider) || finding);
    renderResult({ ...state.currentResult, observedAt: result.observedAt, findings, quickVerification: { purpose: result.purpose, checked: result.findings.length } });
    const counts = result.findings.reduce((acc, finding) => { acc[finding.verification] = (acc[finding.verification] || 0) + 1; return acc; }, {});
    elements.verificationStatus.textContent = `${counts.found || 0} encontrados · ${counts["not-found"] || 0} no encontrados · ${(counts.blocked || 0) + (counts.inconclusive || 0) + (counts.error || 0)} sin conclusión.`;
  } catch (error) {
    elements.verificationStatus.textContent = error.message;
  } finally {
    elements.verificationSubmit.disabled = !state.usernameQuickVerificationEnabled;
  }
});

function updateCaseStats() {
  elements.findingCount.textContent = String(state.findings.length);
  const providers = new Set(state.findings.flatMap(item => item.findings.map(finding => finding.provider).filter(Boolean)));
  elements.sourceCount.textContent = String(providers.size);
}

async function postJson(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

elements.searchType.addEventListener("change", () => {
  elements.searchValue.placeholder = placeholders[elements.searchType.value];
});

elements.searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  elements.results.className = "empty-state";
  elements.results.innerHTML = "<p>Consultando fuentes permitidas…</p>";
  try {
    renderResult(await postJson("/api/search", { type: elements.searchType.value, value: elements.searchValue.value }));
  } catch (error) {
    renderError(error.message);
  }
});

elements.saveResult.addEventListener("click", () => {
  if (!state.currentResult) return;
  state.findings.push(state.currentResult);
  localStorage.setItem("osinttools.case", JSON.stringify(state.findings));
  updateCaseStats();
  elements.saveResult.disabled = true;
  elements.saveResult.textContent = "Guardado";
  setTimeout(() => { elements.saveResult.textContent = "Guardar resultado"; }, 1200);
});

elements.exportCase.addEventListener("click", () => {
  const report = { schemaVersion: "0.1", title: elements.caseName.value.trim() || "Expediente OSINTTools", exportedAt: new Date().toISOString(), results: state.findings };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `osinttools-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

elements.clearCase.addEventListener("click", () => {
  if (!confirm("¿Eliminar todos los resultados guardados en este navegador?")) return;
  state.findings = [];
  localStorage.removeItem("osinttools.case");
  updateCaseStats();
});

async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

elements.passwordForm.addEventListener("submit", async event => {
  event.preventDefault();
  elements.passwordResult.className = "password-result muted";
  elements.passwordResult.textContent = "Calculando localmente y consultando el rango anónimo…";
  try {
    const fullHash = await sha1Hex(elements.passwordValue.value);
    const prefix = fullHash.slice(0, 5);
    const suffix = fullHash.slice(5);
    elements.passwordValue.value = "";
    const range = await postJsonText("/api/password-range", { prefix });
    const match = range.split("\n").map(line => line.trim().split(":")) .find(([candidate]) => candidate === suffix);
    if (match) {
      elements.passwordResult.className = "password-result exposed";
      elements.passwordResult.textContent = `Expuesta: esta contraseña aparece ${Number(match[1]).toLocaleString()} veces en el conjunto consultado. Cámbiala donde la hayas reutilizado.`;
    } else {
      elements.passwordResult.className = "password-result clear";
      elements.passwordResult.textContent = "No fue encontrada en el conjunto consultado. Esto no demuestra que sea fuerte o exclusiva.";
    }
  } catch (error) {
    elements.passwordResult.className = "password-result exposed";
    elements.passwordResult.textContent = error.message;
  }
});

async function postJsonText(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    try { throw new Error(JSON.parse(text).error); } catch (error) { if (error instanceof SyntaxError) throw new Error(`HTTP ${response.status}`); throw error; }
  }
  return text;
}

async function initialize() {
  updateCaseStats();
  try {
    const health = await fetch("/api/health").then(response => response.json());
    state.usernameQuickVerificationEnabled = Boolean(health.connectors.usernameQuickVerification);
    state.quickVerificationProviders = Number(health.usernameCatalog.quickVerificationProviders || 0);
    elements.systemStatus.textContent = `DNS, RDAP y contraseñas activos · Shodan ${health.connectors.shodan ? "activo" : "sin configurar"}`;
    elements.systemStatus.parentElement.classList.add("ready");
  } catch {
    elements.systemStatus.textContent = "Servidor no disponible";
  }
}

initialize();
