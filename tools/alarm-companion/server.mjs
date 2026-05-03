import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.AXTASK_ALARM_COMPANION_PORT || 8787);
const HOST = process.env.AXTASK_ALARM_COMPANION_HOST || "127.0.0.1";
const MAX_BODY_BYTES = Number(process.env.AXTASK_ALARM_COMPANION_MAX_BODY || 600_000);
const SHARED_SECRET = (process.env.AXTASK_ALARM_COMPANION_SECRET || "").trim();
const ALLOW_ORIGINS = (process.env.AXTASK_ALARM_COMPANION_ALLOW_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DATA_PATH = path.join(__dirname, "data", "pending-alarms.json");

/** @type {Map<string, NodeJS.Timeout>} */
const pendingTimers = new Map();

function json(res, code, body, extraHeaders = {}) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || ALLOW_ORIGINS.length === 0) return {};
  if (!ALLOW_ORIGINS.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "vary": "Origin",
  };
}

function readPendingState() {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.alarms)) return data;
  } catch {
    /* missing or corrupt */
  }
  return { alarms: [] };
}

function writePendingState(state) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

function removeAlarmFromDisk(id) {
  const state = readPendingState();
  state.alarms = state.alarms.filter((a) => a.id !== id);
  writePendingState(state);
}

function appendAlarmToDisk(entry) {
  const state = readPendingState();
  state.alarms.push(entry);
  writePendingState(state);
}

function normalizePayload(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid payload");
  }
  const taskActivity = typeof raw.taskActivity === "string" ? raw.taskActivity : "AxTask alarm";
  const alarmAtIso = typeof raw.alarmAtIso === "string" ? raw.alarmAtIso : "";
  const alarmAtMs = alarmAtIso ? new Date(alarmAtIso).getTime() : NaN;
  if (!Number.isFinite(alarmAtMs)) {
    throw new Error("payloadJson.alarmAtIso is required");
  }
  return { taskActivity, alarmAtIso, alarmAtMs };
}

async function runNativeNotification(title, bodyText) {
  if (process.platform === "win32") {
    const ps = `$title='${title.replace(/'/g, "''")}';$body='${bodyText.replace(/'/g, "''")}';Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show($body,$title) | Out-Null`;
    await execFileAsync("powershell", ["-NoProfile", "-Command", ps]);
    return "windows_message_box";
  }
  if (process.platform === "darwin") {
    const script = `display notification "${bodyText.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
    await execFileAsync("osascript", ["-e", script]);
    return "macos_notification";
  }
  try {
    await execFileAsync("notify-send", [title, bodyText]);
    return "linux_notify_send";
  } catch {
    return "linux_no_notifier";
  }
}

function scheduleInProcessAlarm(taskActivity, alarmAtMs, requestId) {
  const delayMs = Math.max(0, alarmAtMs - Date.now());
  if (delayMs > 2_147_483_647) {
    throw new Error("Alarm too far in the future for companion timer");
  }
  appendAlarmToDisk({ id: requestId, taskActivity, alarmAtIso: new Date(alarmAtMs).toISOString(), alarmAtMs });
  const timeout = setTimeout(async () => {
    try {
      await runNativeNotification("AxTask Alarm", taskActivity);
    } catch {
      /* notifier may be unavailable */
    } finally {
      pendingTimers.delete(requestId);
      removeAlarmFromDisk(requestId);
    }
  }, delayMs);
  pendingTimers.set(requestId, timeout);
}

function requireAuth(req, res) {
  if (!SHARED_SECRET) return true;
  const auth = req.headers.authorization || "";
  const expected = `Bearer ${SHARED_SECRET}`;
  if (auth !== expected) {
    json(res, 401, { message: "Unauthorized" }, corsHeaders(req));
    return false;
  }
  return true;
}

function restoreTimersFromDisk() {
  const state = readPendingState();
  const now = Date.now();
  for (const row of state.alarms) {
    if (!row?.id || typeof row.taskActivity !== "string" || typeof row.alarmAtMs !== "number") continue;
    const delayMs = Math.max(0, row.alarmAtMs - now);
    if (delayMs > 2_147_483_647) continue;
    const timeout = setTimeout(async () => {
      try {
        await runNativeNotification("AxTask Alarm", row.taskActivity);
      } catch {
        /* ignore */
      } finally {
        pendingTimers.delete(row.id);
        removeAlarmFromDisk(row.id);
      }
    }, delayMs);
    pendingTimers.set(row.id, timeout);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { method, url } = req;
    if (!method || !url) return json(res, 400, { message: "Bad request" }, corsHeaders(req));

    if (method === "OPTIONS") {
      const h = corsHeaders(req);
      if (Object.keys(h).length === 0) {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(204, h);
      res.end();
      return;
    }

    if (method === "GET" && url === "/health") {
      return json(
        res,
        200,
        {
          ok: true,
          platform: process.platform,
          pending: pendingTimers.size,
          authRequired: Boolean(SHARED_SECRET),
        },
        corsHeaders(req),
      );
    }

    if (method === "POST" && url === "/apply-alarm") {
      if (!requireAuth(req, res)) return;

      let size = 0;
      let rawBody = "";
      let aborted = false;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          aborted = true;
          req.destroy();
        } else {
          rawBody += chunk.toString("utf8");
        }
      });
      req.on("end", async () => {
        if (aborted || size > MAX_BODY_BYTES) {
          if (!aborted) return json(res, 413, { message: "Request body too large" }, corsHeaders(req));
          return;
        }
        try {
          const body = JSON.parse(rawBody || "{}");
          const payloadJson = typeof body.payloadJson === "string" ? body.payloadJson : "";
          if (!payloadJson) return json(res, 400, { message: "payloadJson is required" }, corsHeaders(req));
          const payload = normalizePayload(JSON.parse(payloadJson));
          const requestId = crypto.randomUUID();
          scheduleInProcessAlarm(payload.taskActivity, payload.alarmAtMs, requestId);
          return json(
            res,
            200,
            {
              ok: true,
              requestId,
              platform: process.platform,
              scheduledFor: payload.alarmAtIso,
              mode: "in_process_timer_with_native_notify",
            },
            corsHeaders(req),
          );
        } catch (error) {
          return json(
            res,
            400,
            {
              message: error instanceof Error ? error.message : "Invalid request body",
            },
            corsHeaders(req),
          );
        }
      });
      return;
    }

    return json(res, 404, { message: "Not found" }, corsHeaders(req));
  } catch (error) {
    return json(res, 500, {
      message: error instanceof Error ? error.message : "Companion failure",
    });
  }
});

restoreTimersFromDisk();

server.listen(PORT, HOST, () => {
  console.log(`[alarm-companion] listening on http://${HOST}:${PORT}`);
  console.log("[alarm-companion] endpoints: GET /health, POST /apply-alarm");
  if (SHARED_SECRET) console.log("[alarm-companion] auth: Bearer token required");
  if (ALLOW_ORIGINS.length) console.log(`[alarm-companion] CORS allowlist: ${ALLOW_ORIGINS.join(", ")}`);
});
