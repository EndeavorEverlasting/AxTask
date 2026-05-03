/**
 * Device-only IndexedDB ledger of task completions for local Markov prediction.
 * Never synced to the server.
 */

const DB_NAME = "axtask_local_prediction";
const DB_VERSION = 1;
const STORE = "completion_events";
export const LOCAL_PREDICTION_LEDGER_CAP = 500;

export interface LocalCompletionEvent {
  id: string;
  userId: string;
  at: number;
  taskId: string;
  classification: string;
  /** Matched saved place at completion time, or null if none / unknown. */
  placeId: string | null;
}

export async function openLocalPredictionDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("by_user_at", ["userId", "at"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

export async function getLocalCompletionEvents(userId: string): Promise<LocalCompletionEvent[]> {
  const db = await openLocalPredictionDb();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const os = tx.objectStore(STORE);
    const idx = os.index("by_user_at");
    const out: LocalCompletionEvent[] = [];
    const range = IDBKeyRange.bound([userId, 0], [userId, Number.MAX_SAFE_INTEGER]);
    const cur = idx.openCursor(range);
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        out.push(c.value as LocalCompletionEvent);
        c.continue();
      } else {
        resolve(out);
      }
    };
    cur.onerror = () => reject(cur.error ?? new Error("cursor failed"));
  });
}

async function trimLedgerToCap(db: IDBDatabase, userId: string): Promise<void> {
  const all = await getLocalCompletionEvents(userId);
  if (all.length <= LOCAL_PREDICTION_LEDGER_CAP) return;
  const drop = all.length - LOCAL_PREDICTION_LEDGER_CAP;
  const oldest = all.sort((a, b) => a.at - b.at).slice(0, drop);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const e of oldest) os.delete(e.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("trim failed"));
  });
}

export async function appendLocalCompletionEvent(event: LocalCompletionEvent): Promise<void> {
  const db = await openLocalPredictionDb();
  if (!db) {
    /* IDB unavailable — skip silently */
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(event);
    tx.oncomplete = () => {
      void trimLedgerToCap(db, event.userId).then(() => resolve()).catch(() => resolve());
    };
    tx.onerror = () => reject(tx.error ?? new Error("put failed"));
  });
}

/** Test helper: clear all events for a user. */
export async function clearLocalCompletionEventsForUser(userId: string): Promise<void> {
  const db = await openLocalPredictionDb();
  if (!db) return;
  const rows = await getLocalCompletionEvents(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const e of rows) os.delete(e.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("clear failed"));
  });
}
