import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { canAccessTask } from "./storage";
import cookie from "cookie";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

interface PresenceInfo {
  userId: string;
  email: string;
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

function getSessionStore(): any {
  return (global as any).__sessionStore;
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
    store.get(rawSid, async (err: Error | null, session: any) => {
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

function broadcastToTask(taskId: string, message: Record<string, unknown>, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const client of getTaskRoom(taskId)) {
    if (client.ws !== excludeWs) {
      client.ws.send(payload);
    }
  }
}

function buildPresenceList(taskId: string): PresenceInfo[] {
  return getTaskRoom(taskId).map(c => ({
    userId: c.userId,
    email: c.email,
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

    ws.on("message", async (data) => {
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
            sendPresenceUpdate(oldTaskId);
          }
          client.taskId = msg.taskId;
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
            sendPresenceUpdate(oldTaskId);
          }
          break;
        }

        case "focus_field": {
          client.focusedField = msg.field;
          client.cursorPosition = msg.cursorPosition ?? null;
          if (client.taskId) {
            sendPresenceUpdate(client.taskId);
          }
          break;
        }

        case "blur_field": {
          client.focusedField = null;
          client.cursorPosition = null;
          if (client.taskId) {
            sendPresenceUpdate(client.taskId);
          }
          break;
        }

        case "field_edit": {
          if (client.taskId && client.role !== "viewer") {
            broadcastToTask(client.taskId, {
              type: "field_edit",
              userId: user.userId,
              field: msg.field,
              value: msg.value,
            }, ws);
          }
          break;
        }

        case "task_updated": {
          if (client.taskId && client.role !== "viewer") {
            broadcastToTask(client.taskId, {
              type: "task_updated",
              userId: user.userId,
              task: msg.task,
            }, ws);
          }
          break;
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
  const excludeWs = excludeUserId
    ? Array.from(clients.entries()).find(([, c]) => c.userId === excludeUserId)?.[0]
    : undefined;
  broadcastToTask(taskId, { type: "task_updated", task }, excludeWs);
}
