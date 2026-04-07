import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { canAccessTask, getTaskRowById } from "./storage";
import cookie from "cookie";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

interface PresenceInfo {
  userId: string;
  displayName: string | null;
  color: string;
  focusedField: string | null;
  cursorPosition: number | null;
}

interface CollabClient {
  ws: WebSocket;
  userId: string;
  email: string;
  displayName: string | null;
  taskId: string | null;
  focusedField: string | null;
  cursorPosition: number | null;
  color: string;
  role: string | null;
  /** Short TTL cache for `canAccessTask` to avoid repeated DB hits on edit messages. */
  _accessCache?: { taskId: string; canAccess: boolean; role: string; expiresAt: number };
}

const COLLAB_ACCESS_CACHE_TTL_MS = 4000;

function clearCollabAccessCache(client: CollabClient): void {
  client._accessCache = undefined;
}

type CollabMessage =
  | { type: "join_task"; taskId: string }
  | { type: "leave_task" }
  | { type: "focus_field"; field: string; cursorPosition?: number }
  | { type: "blur_field" }
  | { type: "field_edit"; field: string; value: string }
  | { type: "task_updated"; task: Record<string, unknown> };

const PRESENCE_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
  "#14B8A6", "#6366F1", "#D946EF", "#84CC16",
];

let colorIndex = 0;
function nextColor(): string {
  const color = PRESENCE_COLORS[colorIndex % PRESENCE_COLORS.length];
  colorIndex++;
  return color;
}

const clients = new Map<WebSocket, CollabClient>();

interface SessionStoreWithGet {
  get(sid: string, callback: (err: Error | null, session: { passport?: { user?: string } } | null) => void): void;
}

function getSessionStore(): SessionStoreWithGet | undefined {
  return (global as { __sessionStore?: SessionStoreWithGet }).__sessionStore;
}

async function authenticateWs(req: IncomingMessage): Promise<{ userId: string; email: string; displayName: string | null } | null> {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookie.parse(cookieHeader);
  const sessionId = cookies["axtask.sid"];
  if (!sessionId) return null;

  const rawSid = sessionId.startsWith("s:") ? sessionId.slice(2).split(".")[0] : sessionId;

  const store = getSessionStore();
  if (!store) return null;

  return new Promise((resolve) => {
    const SESSION_LOOKUP_MS = 5000;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, SESSION_LOOKUP_MS);

    store.get(rawSid, async (err: Error | null, session: { passport?: { user?: string } } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err || !session?.passport?.user) {
        resolve(null);
        return;
      }
      const userId = session.passport.user;
      try {
        const [user] = await db.select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        }).from(users).where(eq(users.id, userId));
        if (user) {
          resolve({ userId: user.id, email: user.email, displayName: user.displayName });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

function getTaskRoom(taskId: string): CollabClient[] {
  const room: CollabClient[] = [];
  for (const client of clients.values()) {
    if (client.taskId === taskId && client.ws.readyState === WebSocket.OPEN) {
      room.push(client);
    }
  }
  return room;
}

function broadcastToTask(
  taskId: string,
  message: Record<string, unknown>,
  excludeWs?: WebSocket | WebSocket[],
) {
  const payload = JSON.stringify(message);
  const excludeSet =
    excludeWs === undefined
      ? null
      : new Set(Array.isArray(excludeWs) ? excludeWs : [excludeWs]);
  for (const client of getTaskRoom(taskId)) {
    if (excludeSet?.has(client.ws)) continue;
    try {
      client.ws.send(payload);
    } catch (err) {
      console.error("[collab] broadcast send failed", {
        taskId,
        userId: client.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function buildPresenceList(taskId: string): PresenceInfo[] {
  return getTaskRoom(taskId).map(c => ({
    userId: c.userId,
    displayName: c.displayName,
    color: c.color,
    focusedField: c.focusedField,
    cursorPosition: c.cursorPosition,
  }));
}

function sendPresenceUpdate(taskId: string) {
  const presence = buildPresenceList(taskId);
  broadcastToTask(taskId, { type: "presence_update", users: presence });
}

export function setupCollaborationWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    if (req.url !== "/ws/collab") {
      socket.destroy();
      return;
    }

    const user = await authenticateWs(req);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, user: { userId: string; email: string; displayName: string | null }) => {
    const client: CollabClient = {
      ws,
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      taskId: null,
      focusedField: null,
      cursorPosition: null,
      color: nextColor(),
      role: null,
    };
    clients.set(ws, client);

    ws.send(JSON.stringify({ type: "connected", userId: user.userId, color: client.color }));

    async function assertCollabEditAccess(): Promise<boolean> {
      if (!client.taskId) return false;
      const now = Date.now();
      const cached = client._accessCache;
      if (cached && cached.taskId === client.taskId && cached.expiresAt > now) {
        if (!cached.canAccess) {
          const oldTaskId = client.taskId;
          client.taskId = null;
          client.focusedField = null;
          client.cursorPosition = null;
          clearCollabAccessCache(client);
          sendPresenceUpdate(oldTaskId);
          ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
          return false;
        }
        client.role = cached.role;
        if (cached.role === "viewer") {
          ws.send(JSON.stringify({ type: "error", message: "View-only access" }));
          return false;
        }
        return true;
      }

      const access = await canAccessTask(client.userId, client.taskId);
      client._accessCache = {
        taskId: client.taskId,
        canAccess: access.canAccess,
        role: access.role,
        expiresAt: now + COLLAB_ACCESS_CACHE_TTL_MS,
      };
      if (!access.canAccess) {
        const oldTaskId = client.taskId;
        client.taskId = null;
        client.focusedField = null;
        client.cursorPosition = null;
        clearCollabAccessCache(client);
        sendPresenceUpdate(oldTaskId);
        ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
        return false;
      }
      client.role = access.role;
      if (access.role === "viewer") {
        ws.send(JSON.stringify({ type: "error", message: "View-only access" }));
        return false;
      }
      return true;
    }

    ws.on("message", async (data) => {
      try {
        let msg: CollabMessage;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        switch (msg.type) {
        case "join_task": {
          const access = await canAccessTask(user.userId, msg.taskId);
          if (!access.canAccess) {
            ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
            return;
          }
          if (client.taskId) {
            const oldTaskId = client.taskId;
            client.taskId = null;
            client.focusedField = null;
            client.cursorPosition = null;
            clearCollabAccessCache(client);
            sendPresenceUpdate(oldTaskId);
          }
          client.taskId = msg.taskId;
          clearCollabAccessCache(client);
          client.role = access.role;
          sendPresenceUpdate(msg.taskId);
          ws.send(JSON.stringify({ type: "joined_task", taskId: msg.taskId, role: access.role }));
          break;
        }

        case "leave_task": {
          if (client.taskId) {
            const oldTaskId = client.taskId;
            client.taskId = null;
            client.focusedField = null;
            client.cursorPosition = null;
            clearCollabAccessCache(client);
            sendPresenceUpdate(oldTaskId);
          }
          break;
        }

        case "focus_field": {
          if (!client.taskId) {
            client.focusedField = msg.field;
            client.cursorPosition = msg.cursorPosition ?? null;
            break;
          }
          const access = await canAccessTask(client.userId, client.taskId);
          if (!access.canAccess) {
            const oldTaskId = client.taskId;
            client.taskId = null;
            client.focusedField = null;
            client.cursorPosition = null;
            client.role = null;
            clearCollabAccessCache(client);
            sendPresenceUpdate(oldTaskId);
            break;
          }
          client.role = access.role;
          client.focusedField = msg.field;
          client.cursorPosition = msg.cursorPosition ?? null;
          sendPresenceUpdate(client.taskId);
          break;
        }

        case "blur_field": {
          if (!client.taskId) {
            client.focusedField = null;
            client.cursorPosition = null;
            break;
          }
          const access = await canAccessTask(client.userId, client.taskId);
          if (!access.canAccess) {
            const oldTaskId = client.taskId;
            client.taskId = null;
            client.focusedField = null;
            client.cursorPosition = null;
            client.role = null;
            clearCollabAccessCache(client);
            sendPresenceUpdate(oldTaskId);
            break;
          }
          client.role = access.role;
          client.focusedField = null;
          client.cursorPosition = null;
          sendPresenceUpdate(client.taskId);
          break;
        }

        case "field_edit": {
          if (!client.taskId) break;
          if (!(await assertCollabEditAccess())) break;
          broadcastToTask(client.taskId, {
            type: "field_edit",
            userId: client.userId,
            field: msg.field,
            value: msg.value,
          }, ws);
          break;
        }

        case "task_updated": {
          if (!client.taskId) break;
          if (!(await assertCollabEditAccess())) break;
          const canonical = await getTaskRowById(client.taskId);
          if (!canonical || canonical.id !== client.taskId) break;
          const taskPayload = JSON.parse(JSON.stringify(canonical)) as Record<string, unknown>;
          broadcastToTask(client.taskId, {
            type: "task_updated",
            userId: client.userId,
            task: taskPayload,
          }, ws);
          break;
        }
        }
      } catch (err) {
        console.error("[collab] message handler error:", err);
        try {
          ws.send(JSON.stringify({ type: "error", message: "Server error processing message" }));
        } catch {
          /* socket may be closing */
        }
        const tid = client.taskId;
        if (tid) {
          sendPresenceUpdate(tid);
        }
      }
    });

    ws.on("close", () => {
      const taskId = client.taskId;
      clients.delete(ws);
      if (taskId) {
        sendPresenceUpdate(taskId);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        const taskId = client.taskId;
        clients.delete(ws);
        if (taskId) sendPresenceUpdate(taskId);
      }
    }
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

export function notifyTaskUpdate(taskId: string, task: Record<string, unknown>, excludeUserId?: string) {
  const excludeWsList = excludeUserId
    ? Array.from(clients.entries())
        .filter(([, c]) => c.userId === excludeUserId)
        .map(([ws]) => ws)
    : undefined;
  broadcastToTask(
    taskId,
    { type: "task_updated", task },
    excludeWsList?.length ? excludeWsList : undefined,
  );
}
