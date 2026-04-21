const DB_NAME = "axtask_e2ee_v1";
const STORE = "kv";
const K_DEVICE = "deviceId";
const K_PRIV_JWK = "ecdhPrivateJwk";
const K_PUB_PEM = "ecdhPublicPem";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGet(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDmDeviceState(): Promise<{
  deviceId: string;
  privateKeyJwkJson: string;
  publicKeySpkiPem: string;
} | null> {
  const db = await openDb();
  try {
    const deviceId = await idbGet(db, K_DEVICE);
    const privateKeyJwkJson = await idbGet(db, K_PRIV_JWK);
    const publicKeySpkiPem = await idbGet(db, K_PUB_PEM);
    if (!deviceId || !privateKeyJwkJson || !publicKeySpkiPem) return null;
    return { deviceId, privateKeyJwkJson, publicKeySpkiPem };
  } finally {
    db.close();
  }
}

export async function saveDmDeviceState(input: {
  deviceId: string;
  privateKeyJwkJson: string;
  publicKeySpkiPem: string;
}): Promise<void> {
  const db = await openDb();
  try {
    await idbSet(db, K_DEVICE, input.deviceId);
    await idbSet(db, K_PRIV_JWK, input.privateKeyJwkJson);
    await idbSet(db, K_PUB_PEM, input.publicKeySpkiPem);
  } finally {
    db.close();
  }
}
