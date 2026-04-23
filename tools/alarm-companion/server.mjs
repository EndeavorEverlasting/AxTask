import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.AXTASK_ALARM_COMPANION_PORT || 8787);
const HOST = process.env.AXTASK_ALARM_COMPANION_HOST || "127.0.0.1";

/** @type {Map<string, NodeJS.Timeout>} */
const pendingTimers = new Map();

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
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
  // Linux best effort. notify-send may not exist; caller falls back to no-op receipt.
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
  const timeout = setTimeout(async () => {
    try {
      await runNativeNotification("AxTask Alarm", taskActivity);
    } catch {
      // keep process alive and clear timer entry regardless of notifier availability
    } finally {
      pendingTimers.delete(requestId);
    }
  }, delayMs);
  pendingTimers.set(requestId, timeout);
}

const server = http.createServer(async (req, res) => {
  try {
    const { method, url } = req;
    if (!method || !url) return json(res, 400, { message: "Bad request" });

    if (method === "GET" && url === "/health") {
      return json(res, 200, {
        ok: true,
        platform: process.platform,
        pending: pendingTimers.size,
      });
    }

    if (method === "POST" && url === "/apply-alarm") {
      let rawBody = "";
      req.on("data", (chunk) => {
        rawBody += chunk.toString("utf8");
      });
      req.on("end", async () => {
        try {
          const body = JSON.parse(rawBody || "{}");
          const payloadJson = typeof body.payloadJson === "string" ? body.payloadJson : "";
          if (!payloadJson) return json(res, 400, { message: "payloadJson is required" });
          const payload = normalizePayload(JSON.parse(payloadJson));
          const requestId = crypto.randomUUID();
          scheduleInProcessAlarm(payload.taskActivity, payload.alarmAtMs, requestId);
          return json(res, 200, {
            ok: true,
            requestId,
            platform: process.platform,
            scheduledFor: payload.alarmAtIso,
            mode: "in_process_timer_with_native_notify",
          });
        } catch (error) {
          return json(res, 400, {
            message: error instanceof Error ? error.message : "Invalid request body",
          });
        }
      });
      return;
    }

    return json(res, 404, { message: "Not found" });
  } catch (error) {
    return json(res, 500, {
      message: error instanceof Error ? error.message : "Companion failure",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[alarm-companion] listening on http://${HOST}:${PORT}`);
  console.log("[alarm-companion] endpoints: GET /health, POST /apply-alarm");
});
