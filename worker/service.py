from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

VERSION = "0.7.0"
MAX_SITES = min(500, max(1, int(os.getenv("MAIGRET_MAX_SITES", "500"))))
MAX_QUEUE = min(50, max(1, int(os.getenv("MAIGRET_MAX_QUEUE", "10"))))
MAX_WORKERS = min(4, max(1, int(os.getenv("MAIGRET_WORKERS", "1"))))
JOB_TIMEOUT = min(1800, max(60, int(os.getenv("MAIGRET_JOB_TIMEOUT_SECONDS", "600"))))
JOB_RETENTION = min(86400, max(1800, int(os.getenv("MAIGRET_JOB_RETENTION_SECONDS", "21600"))))
AUTH_WINDOW_SECONDS = 300
PURPOSES = {"self-audit", "owned-brand", "authorized-investigation"}
USERNAME_PATTERN = re.compile(r"^[\w.-]{2,64}$", re.UNICODE)
TAG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,24}$")

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()
seen_nonces: dict[str, float] = {}
nonces_lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="maigret-job")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def worker_secret() -> bytes:
    value = os.getenv("OSINTTOOLS_WORKER_SECRET", "")
    if len(value) < 32:
        raise RuntimeError("OSINTTOOLS_WORKER_SECRET must contain at least 32 characters")
    return value.encode("utf-8")


def valid_signature(timestamp: str, nonce: str, signature: str, body: bytes) -> bool:
    try:
        numeric_timestamp = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - numeric_timestamp) > AUTH_WINDOW_SECONDS:
        return False
    if not re.fullmatch(r"[0-9a-f-]{36}", nonce or "", re.IGNORECASE):
        return False
    now = time.time()
    with nonces_lock:
        for expired in [value for value, observed in seen_nonces.items() if now - observed > AUTH_WINDOW_SECONDS]:
            del seen_nonces[expired]
        if nonce in seen_nonces:
            return False
    message = timestamp.encode("ascii") + b"." + nonce.encode("ascii") + b"." + body
    expected = hmac.new(worker_secret(), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature or ""):
        return False
    with nonces_lock:
        seen_nonces[nonce] = now
    return True


def validate_job_input(payload: dict) -> dict:
    username = str(payload.get("username", "")).strip()
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError("Nombre de usuario inválido")
    purpose = payload.get("purpose")
    if purpose not in PURPOSES:
        raise ValueError("Propósito no admitido")
    if payload.get("authorizationAcknowledged") is not True:
        raise ValueError("Se requiere confirmar la autorización")
    max_sites = payload.get("maxSites", 100)
    if not isinstance(max_sites, int) or isinstance(max_sites, bool) or not 1 <= max_sites <= MAX_SITES:
        raise ValueError(f"maxSites debe estar entre 1 y {MAX_SITES}")
    tags = payload.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 5 or any(not isinstance(tag, str) or not TAG_PATTERN.fullmatch(tag) for tag in tags):
        raise ValueError("Etiquetas inválidas")
    return {"username": username, "purpose": purpose, "maxSites": max_sites, "tags": tags}


def normalize_report(report: dict, username: str) -> list[dict]:
    findings = []
    observed_at = utc_now()
    for provider, entry in list(report.items())[:MAX_SITES]:
        if not isinstance(entry, dict):
            continue
        url = entry.get("url_user") or entry.get("url")
        if not isinstance(url, str) or urlparse(url).scheme not in {"http", "https"}:
            continue
        site = entry.get("site") if isinstance(entry.get("site"), dict) else {}
        tags = site.get("tags") if isinstance(site.get("tags"), list) else []
        findings.append({
            "provider": str(provider)[:120],
            "category": "broad",
            "url": url,
            "confidence": "pattern-match",
            "verification": "claimed",
            "observedAt": observed_at,
            "note": "Maigret observó un patrón asociado con un perfil público existente. Requiere revisión humana y no demuestra quién controla la cuenta.",
            "details": {
                "username": username,
                "method": "maigret-pattern",
                "tags": [str(tag)[:24] for tag in tags[:12]],
                "httpStatus": entry.get("http_status") if isinstance(entry.get("http_status"), int) else None,
            },
        })
    return findings


def run_job(job_id: str, job_input: dict) -> None:
    with jobs_lock:
        jobs[job_id].update({"status": "running", "updatedAt": utc_now()})
    try:
        with tempfile.TemporaryDirectory(prefix="osinttools-maigret-") as output_dir:
            command = [
                sys.executable, "-m", "maigret", job_input["username"],
                "--json", "simple",
                "--folderoutput", output_dir,
                "--top-sites", str(job_input["maxSites"]),
                "--timeout", "10",
                "--max-connections", "10",
                "--no-recursion",
                "--no-color",
            ]
            if job_input["tags"]:
                command.extend(["--tags", ",".join(job_input["tags"])])
            execution = subprocess.run(command, capture_output=True, text=True, timeout=JOB_TIMEOUT, check=False)
            if execution.returncode != 0:
                diagnostic = (execution.stderr or execution.stdout or "sin diagnóstico").strip()[-800:]
                raise RuntimeError(f"Maigret terminó con código {execution.returncode}: {diagnostic}")
            report_path = Path(output_dir) / f"report_{job_input['username']}_simple.json"
            if not report_path.is_file() or report_path.stat().st_size > 5 * 1024 * 1024:
                raise RuntimeError("Maigret no produjo un reporte válido")
            report = json.loads(report_path.read_text(encoding="utf-8"))
            findings = normalize_report(report, job_input["username"])
        with jobs_lock:
            jobs[job_id].update({
                "status": "completed",
                "updatedAt": utc_now(),
                "completedAt": utc_now(),
                "checkedSites": job_input["maxSites"],
                "findings": findings,
            })
    except subprocess.TimeoutExpired:
        with jobs_lock:
            jobs[job_id].update({"status": "failed", "updatedAt": utc_now(), "error": "La búsqueda amplia agotó su tiempo máximo"})
    except Exception as error:
        with jobs_lock:
            jobs[job_id].update({"status": "failed", "updatedAt": utc_now(), "error": str(error)[:1000]})


def cleanup_jobs() -> None:
    cutoff = time.time() - JOB_RETENTION
    with jobs_lock:
        expired = [job_id for job_id, job in jobs.items() if job.get("createdUnix", 0) < cutoff and job.get("status") not in {"queued", "running"}]
        for job_id in expired:
            del jobs[job_id]


class Handler(BaseHTTPRequestHandler):
    server_version = "OSINTToolsMaigret/0.7"

    def log_message(self, message: str, *args) -> None:
        sys.stdout.write(f"{self.log_date_time_string()} {message % args}\n")

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> bytes:
        length = int(self.headers.get("content-length", "0"))
        if length < 0 or length > 20_000:
            raise ValueError("Solicitud demasiado grande")
        return self.rfile.read(length)

    def authorized(self, body: bytes) -> bool:
        return valid_signature(
            self.headers.get("x-osinttools-timestamp", ""),
            self.headers.get("x-osinttools-nonce", ""),
            self.headers.get("x-osinttools-signature", ""),
            body,
        )

    def do_GET(self) -> None:
        cleanup_jobs()
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(200, {"status": "ok", "version": VERSION, "maxSites": MAX_SITES, "workers": MAX_WORKERS})
            return
        if not self.authorized(b""):
            self.send_json(401, {"error": "Firma inválida o vencida"})
            return
        match = re.fullmatch(r"/v1/jobs/([0-9a-f-]{36})", path, re.IGNORECASE)
        if not match:
            self.send_json(404, {"error": "Ruta no encontrada"})
            return
        with jobs_lock:
            job = jobs.get(match.group(1))
            snapshot = {key: value for key, value in job.items() if key != "createdUnix"} if job else None
        self.send_json(200, snapshot) if snapshot else self.send_json(404, {"error": "Trabajo no encontrado"})

    def do_POST(self) -> None:
        cleanup_jobs()
        try:
            body = self.read_body()
            if not self.authorized(body):
                self.send_json(401, {"error": "Firma inválida o vencida"})
                return
            if urlparse(self.path).path != "/v1/jobs":
                self.send_json(404, {"error": "Ruta no encontrada"})
                return
            job_input = validate_job_input(json.loads(body or b"{}"))
            with jobs_lock:
                active = sum(job.get("status") in {"queued", "running"} for job in jobs.values())
                if active >= MAX_QUEUE:
                    self.send_json(429, {"error": "La cola de búsqueda amplia está llena"})
                    return
                job_id = str(uuid.uuid4())
                jobs[job_id] = {
                    "id": job_id,
                    "status": "queued",
                    "username": job_input["username"],
                    "purpose": job_input["purpose"],
                    "maxSites": job_input["maxSites"],
                    "createdAt": utc_now(),
                    "updatedAt": utc_now(),
                    "createdUnix": time.time(),
                }
            executor.submit(run_job, job_id, job_input)
            self.send_json(202, {"id": job_id, "status": "queued", "maxSites": job_input["maxSites"]})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except RuntimeError as error:
            self.send_json(503, {"error": str(error)})
        except Exception:
            self.send_json(500, {"error": "Error interno del trabajador"})


def main() -> None:
    worker_secret()
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"OSINTTools Maigret worker {VERSION} listening on 0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
