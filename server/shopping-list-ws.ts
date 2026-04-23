import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { authenticateWs } from "./collaboration";
import { getShoppingListMemberRole } from "./shopping-lists-storage";

interface ShoppingWsClient {
  ws: WebSocket;
  userId: string;
  listId: string | null;
}

const clients = new Map<WebSocket, ShoppingWsClient>();

function getListRoom(listId: string): ShoppingWsClient[] {
  const out: ShoppingWsClient[] = [];
  for (const c of clients.values()) {
    if (c.listId === listId && c.ws.readyState === WebSocket.OPEN) out.push(c);
  }
  return out;
}

function broadcastList(listId: string, message: Record<string, unknown>, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const c of getListRoom(listId)) {
    if (c.ws !== excludeWs) c.ws.send(payload);
  }
}

export function notifyShoppingListItemUpsert(listId: string, item: Record<string, unknown>) {
  broadcastList(listId, { type: "list_item_upsert", listId, item });
}

export function notifyShoppingListItemRemoved(listId: string, itemId: string) {
  broadcastList(listId, { type: "list_item_removed", listId, itemId });
}

export function notifyShoppingListReordered(listId: string) {
  broadcastList(listId, { type: "list_reordered", listId });
}

type ShoppingWsMessage =
  | { type: "join_list"; listId: string }
  | { type: "leave_list" };

export function setupShoppingListWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    if (req.url !== "/ws/shopping") {
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

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, user: { userId: string }) => {
    const client: ShoppingWsClient = { ws, userId: user.userId, listId: null };
    clients.set(ws, client);
    ws.send(JSON.stringify({ type: "connected", userId: user.userId }));

    ws.on("message", async (data) => {
      let msg: ShoppingWsMessage;
      try {
        msg = JSON.parse(data.toString()) as ShoppingWsMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "join_list") {
        const role = await getShoppingListMemberRole(user.userId, msg.listId);
        if (!role) {
          ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
          return;
        }
        if (client.listId && client.listId !== msg.listId) {
          client.listId = null;
        }
        client.listId = msg.listId;
        ws.send(JSON.stringify({ type: "joined_list", listId: msg.listId, role }));
        return;
      }

      if (msg.type === "leave_list") {
        client.listId = null;
        ws.send(JSON.stringify({ type: "left_list" }));
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  const heartbeat = setInterval(() => {
    for (const [ws] of clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        clients.delete(ws);
      }
    }
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}
