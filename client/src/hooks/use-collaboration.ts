import { useState, useEffect, useRef, useCallback } from "react";

interface PresenceUser {
  userId: string;
  displayName: string | null;
  color: string;
  focusedField: string | null;
  cursorPosition: number | null;
}

interface CollabState {
  connected: boolean;
  users: PresenceUser[];
  myColor: string;
  myUserId: string | null;
  role: string;
}

interface FieldEdit {
  userId: string;
  field: string;
  value: string;
}

function parseUserId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function coercePresenceUser(raw: unknown): PresenceUser | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const userId = parseUserId(o.userId);
  if (!userId) return null;
  const displayName =
    o.displayName === null ? null : typeof o.displayName === "string" ? o.displayName : null;
  const color = typeof o.color === "string" && o.color.length > 0 ? o.color : "#64748B";
  const focusedField =
    o.focusedField === null ? null : typeof o.focusedField === "string" ? o.focusedField : null;
  const cursorPosition =
    o.cursorPosition === null
      ? null
      : typeof o.cursorPosition === "number" && Number.isFinite(o.cursorPosition)
        ? o.cursorPosition
        : null;
  return { userId, displayName, color, focusedField, cursorPosition };
}

export function useCollaboration(taskId: string | null) {
  const [state, setState] = useState<CollabState>({
    connected: false,
    users: [],
    myColor: "#3B82F6",
    myUserId: null,
    role: "owner",
  });
  const [fieldEdits, setFieldEdits] = useState<FieldEdit[]>([]);
  const fieldEditsRef = useRef<FieldEdit[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskIdRef = useRef(taskId);
  /** Last task id we successfully sent `join_task` for on the current socket (avoids duplicate joins from onopen + effect). */
  const joinedTaskIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  taskIdRef.current = taskId;

  useEffect(() => {
    fieldEditsRef.current = fieldEdits;
  }, [fieldEdits]);

  const sendJoinTaskIfNeeded = useCallback((ws: WebSocket, tid: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (joinedTaskIdRef.current === tid) return;
    ws.send(JSON.stringify({ type: "join_task", taskId: tid }));
    joinedTaskIdRef.current = tid;
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/collab`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setState(s => ({ ...s, connected: true }));
      const tid = taskIdRef.current;
      if (tid) {
        sendJoinTaskIfNeeded(ws, tid);
      }
    };

    ws.onmessage = async (event) => {
      let raw: string;
      try {
        const d = event.data;
        if (typeof d === "string") {
          raw = d;
        } else if (d instanceof Blob) {
          raw = await d.text();
        } else if (d instanceof ArrayBuffer) {
          raw = new TextDecoder().decode(d);
        } else {
          console.warn("[collab] Unsupported WebSocket message type:", typeof d);
          return;
        }
      } catch (e) {
        console.warn("[collab] Failed to read WebSocket message:", e);
        return;
      }
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch (parseErr) {
        console.warn("[collab] Invalid JSON from server:", raw, parseErr);
        return;
      }
      const type = msg.type;
      if (typeof type !== "string") return;

      switch (type) {
        case "connected":
          setState(s => ({
            ...s,
            myColor:
              typeof msg.color === "string" && msg.color.length > 0 ? msg.color : s.myColor,
            myUserId: parseUserId(msg.userId),
          }));
          break;
        case "joined_task":
          setState(s => ({ ...s, role: typeof msg.role === "string" ? msg.role : s.role }));
          break;
        case "presence_update": {
          const rawUsers = msg.users;
          if (!Array.isArray(rawUsers)) {
            console.warn("[collab] presence_update: users is not an array");
            break;
          }
          const users = rawUsers.map(coercePresenceUser).filter((u): u is PresenceUser => u !== null);
          if (users.length !== rawUsers.length) {
            console.warn("[collab] presence_update: dropped invalid user entries");
          }
          setState(s => ({ ...s, users }));
          break;
        }
        case "field_edit":
          setFieldEdits(prev => [...prev.slice(-19), {
            userId: String(msg.userId),
            field: String(msg.field),
            value: String(msg.value ?? ""),
          }]);
          break;
        case "task_updated":
          break;
        case "error":
          console.warn("[collab]", msg.message);
          break;
      }
    };

    ws.onclose = () => {
      joinedTaskIdRef.current = null;
      setState(s => ({ ...s, connected: false, users: [] }));
      wsRef.current = null;
      if (mountedRef.current) {
        if (reconnectTimerRef.current != null) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };
  }, [sendJoinTaskIfNeeded]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    if (taskId) {
      sendJoinTaskIfNeeded(ws, taskId);
    } else {
      joinedTaskIdRef.current = null;
      ws.send(JSON.stringify({ type: "leave_task" }));
      setState(s => ({ ...s, users: [], role: "owner" }));
    }
  }, [taskId, sendJoinTaskIfNeeded]);

  const focusField = useCallback((field: string, cursorPosition?: number) => {
    wsRef.current?.send(JSON.stringify({ type: "focus_field", field, cursorPosition }));
  }, []);

  const blurField = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "blur_field" }));
  }, []);

  const sendFieldEdit = useCallback((field: string, value: string) => {
    wsRef.current?.send(JSON.stringify({ type: "field_edit", field, value }));
  }, []);

  const leaveTask = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "leave_task" }));
    setState(s => ({ ...s, users: [], role: "owner" }));
  }, []);

  const consumeFieldEdit = useCallback((field: string): FieldEdit | undefined => {
    const q = fieldEditsRef.current.slice();
    const idx = q.findIndex(e => e.field === field);
    if (idx < 0) return undefined;
    const [removed] = q.splice(idx, 1);
    fieldEditsRef.current = q;
    setFieldEdits(q);
    return removed;
  }, []);

  return {
    ...state,
    focusField,
    blurField,
    sendFieldEdit,
    leaveTask,
    fieldEdits,
    consumeFieldEdit,
    otherUsers: state.users.filter(u => u.userId !== state.myUserId),
  };
}
