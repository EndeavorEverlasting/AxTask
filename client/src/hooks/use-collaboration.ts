import { useState, useEffect, useRef, useCallback } from "react";

interface PresenceUser {
  userId: string;
  email: string;
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
  const email = typeof o.email === "string" ? o.email : "";
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
  return { userId, email, displayName, color, focusedField, cursorPosition };
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskIdRef = useRef(taskId);
  const mountedRef = useRef(true);
  taskIdRef.current = taskId;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/collab`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setState(s => ({ ...s, connected: true }));
      if (taskIdRef.current) {
        ws.send(JSON.stringify({ type: "join_task", taskId: taskIdRef.current }));
      }
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch (parseErr) {
        console.warn("[collab] Invalid JSON from server:", event.data, parseErr);
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
          setFieldEdits(prev => [...prev.slice(-20), {
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
      setState(s => ({ ...s, connected: false, users: [] }));
      wsRef.current = null;
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };
  }, []);

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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (taskId) {
      ws.send(JSON.stringify({ type: "join_task", taskId }));
    } else {
      ws.send(JSON.stringify({ type: "leave_task" }));
      setState(s => ({ ...s, users: [], role: "owner" }));
    }
  }, [taskId]);

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
    const edit = fieldEdits.find(e => e.field === field);
    if (edit) {
      setFieldEdits(prev => prev.filter(e => e !== edit));
    }
    return edit;
  }, [fieldEdits]);

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
