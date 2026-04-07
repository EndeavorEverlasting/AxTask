#!/usr/bin/env node
/**
 * Local GUI wizard for configuring .env.docker and optionally starting docker:up.
 * Usage: npm run docker:setup
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import {
  applyDockerGuiValues,
  validateDockerGuiValues,
} from "./docker-setup-gui-lib.mjs";
import { parseEnvAssignmentLines } from "./docker-start-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const envExamplePath = path.join(projectRoot, ".env.docker.example");
const envDockerPath = path.join(projectRoot, ".env.docker");
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

if (!fs.existsSync(envExamplePath)) {
  console.error("[docker:setup] Missing .env.docker.example");
  process.exit(1);
}

/**
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseForm(text) {
  const out = {};
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const eqIdx = pair.indexOf("=");
    const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
    const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : "";
    const key = decodeURIComponent(String(rawKey || "").replaceAll("+", " "));
    const value = decodeURIComponent(String(rawVal || "").replaceAll("+", " "));
    out[key] = value;
  }
  return out;
}

/**
 * @returns {Record<string, string>}
 */
function defaultFormValues() {
  const source = fs.existsSync(envDockerPath)
    ? fs.readFileSync(envDockerPath, "utf8")
    : fs.readFileSync(envExamplePath, "utf8");
  const map = parseEnvAssignmentLines(source);
  const seededSecret =
    map.SESSION_SECRET &&
    map.SESSION_SECRET !== "replace-with-32-plus-char-secret"
      ? map.SESSION_SECRET
      : randomBytes(24).toString("hex");
  return {
    POSTGRES_PASSWORD: map.POSTGRES_PASSWORD || "123",
    SESSION_SECRET: seededSecret,
    AXTASK_DOCKER_SEED_DEMO:
      map.AXTASK_DOCKER_SEED_DEMO === "0" ? "0" : "1",
    DOCKER_DEMO_USER_EMAIL: map.DOCKER_DEMO_USER_EMAIL || "demo@axtask.local",
    DOCKER_DEMO_PASSWORD:
      map.DOCKER_DEMO_PASSWORD || "LocalDockerDemo!ChangeMe",
  };
}

/**
 * @param {Record<string, string>} values
 * @param {string} [message]
 * @param {string} [error]
 * @returns {string}
 */
function pageHtml(values, message = "", error = "") {
  const demoChecked = values.AXTASK_DOCKER_SEED_DEMO === "1" ? "checked" : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>AxTask Docker Setup Wizard</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; }
      .wrap { max-width: 760px; margin: 30px auto; padding: 20px; }
      .card { background: #111827; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
      h1 { margin-top: 0; }
      p { color: #cbd5e1; }
      label { display: block; margin: 12px 0 6px; font-weight: 600; }
      input[type=text], input[type=password] {
        width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #475569;
        background: #0b1220; color: #e2e8f0;
      }
      .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
      .hint { font-size: 13px; color: #93c5fd; margin-top: 6px; }
      .ok { background: #052e16; border: 1px solid #166534; color: #bbf7d0; padding: 10px; border-radius: 8px; margin-bottom: 10px; }
      .err { background: #3f0f0f; border: 1px solid #7f1d1d; color: #fecaca; padding: 10px; border-radius: 8px; margin-bottom: 10px; }
      button {
        padding: 10px 14px; border-radius: 8px; border: 1px solid #2563eb; background: #1d4ed8; color: white; cursor: pointer;
      }
      button.secondary { border-color: #475569; background: #1e293b; }
      .cmd { margin-top: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 10px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>AxTask Docker Setup Wizard</h1>
        <p>Beginner mode: fill values, save <code>.env.docker</code>, and optionally start Docker stack in one click.</p>
        ${message ? `<div class="ok">${esc(message)}</div>` : ""}
        ${error ? `<div class="err">${esc(error)}</div>` : ""}
        <form method="post" action="/save">
          <label>POSTGRES_PASSWORD</label>
          <input name="POSTGRES_PASSWORD" value="${esc(values.POSTGRES_PASSWORD)}" />
          <div class="hint">Must match DATABASE_URL password.</div>

          <label>SESSION_SECRET</label>
          <input name="SESSION_SECRET" value="${esc(values.SESSION_SECRET)}" />
          <div class="hint">32+ characters recommended.</div>

          <div class="row">
            <input id="seed" type="checkbox" name="AXTASK_DOCKER_SEED_DEMO" value="1" ${demoChecked} />
            <label for="seed" style="margin:0;">Seed local demo user</label>
          </div>

          <label>DOCKER_DEMO_USER_EMAIL</label>
          <input name="DOCKER_DEMO_USER_EMAIL" value="${esc(values.DOCKER_DEMO_USER_EMAIL)}" />

          <label>DOCKER_DEMO_PASSWORD</label>
          <input name="DOCKER_DEMO_PASSWORD" value="${esc(values.DOCKER_DEMO_PASSWORD)}" />
          <div class="hint">Use only local/offline. Replace before any internet-exposed deployment.</div>

          <div class="row">
            <button type="submit" name="wizard_action" value="save">Save .env.docker</button>
            <button class="secondary" type="submit" name="wizard_action" value="save-and-start">Save + Start Docker</button>
          </div>
        </form>

        <div class="cmd">Manual fallback: npm run docker:up</div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * @param {Record<string, string>} formData
 * @returns {Record<string, string>}
 */
function normalizeForm(formData) {
  return {
    POSTGRES_PASSWORD: String(formData.POSTGRES_PASSWORD || "").trim(),
    SESSION_SECRET: String(formData.SESSION_SECRET || "").trim(),
    AXTASK_DOCKER_SEED_DEMO:
      String(formData.AXTASK_DOCKER_SEED_DEMO || "0") === "1" ? "1" : "0",
    DOCKER_DEMO_USER_EMAIL: String(
      formData.DOCKER_DEMO_USER_EMAIL || "demo@axtask.local",
    ).trim(),
    DOCKER_DEMO_PASSWORD: String(formData.DOCKER_DEMO_PASSWORD || "").trim(),
  };
}

/**
 * @returns {Promise<{ code: number, output: string }>}
 */
function runDockerUp() {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "docker:up"], {
      cwd: projectRoot,
      shell: isWin,
    });
    let output = "";
    child.stdout?.on("data", (d) => {
      output += String(d);
    });
    child.stderr?.on("data", (d) => {
      output += String(d);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404).end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    const values = defaultFormValues();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pageHtml(values));
    return;
  }

  if (req.method === "POST" && req.url === "/save") {
    let body = "";
    let tooLarge = false;
    for await (const chunk of req) {
      body += String(chunk);
      if (body.length > 1_000_000) {
        tooLarge = true;
        break;
      }
    }
    if (tooLarge) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Request body too large");
      return;
    }
    const rawForm = parseForm(body);
    const normalized = normalizeForm(rawForm);
    const error = validateDockerGuiValues(normalized);
    if (error) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(pageHtml(normalized, "", error));
      return;
    }

    const baseText = fs.existsSync(envDockerPath)
      ? fs.readFileSync(envDockerPath, "utf8")
      : fs.readFileSync(envExamplePath, "utf8");
    const next = applyDockerGuiValues(baseText, normalized);
    fs.writeFileSync(envDockerPath, next, "utf8");

    const shouldStart =
      String(rawForm.wizard_action || "save") === "save-and-start";
    if (!shouldStart) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        pageHtml(
          normalized,
          ".env.docker saved. Next: run npm run docker:up (or use Save + Start).",
        ),
      );
      return;
    }

    const run = await runDockerUp();
    const message =
      run.code === 0
        ? "Docker stack started successfully."
        : "docker:up failed. Review output below.";
    const colorClass = run.code === 0 ? "ok" : "err";
    const html = `${pageHtml(normalized, message)}
<div class="wrap"><div class="card"><div class="${colorClass}">Exit code: ${run.code}</div><pre style="white-space:pre-wrap; max-height:420px; overflow:auto;">${esc(run.output)}</pre></div></div>`;
    res.writeHead(run.code === 0 ? 200 : 500, {
      "Content-Type": "text/html; charset=utf-8",
    });
    res.end(html);
    return;
  }

  res.writeHead(404).end();
});

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  if (!addr || typeof addr === "string") return;
  const url = `http://127.0.0.1:${addr.port}`;
  console.log(`[docker:setup] Open ${url}`);
  console.log("[docker:setup] Press Ctrl+C to stop the wizard.");

  if (isWin) {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else if (isMac) {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
});
