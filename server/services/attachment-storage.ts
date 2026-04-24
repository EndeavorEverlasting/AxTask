import fs from "fs/promises";
import path from "path";

const defaultDir = path.resolve(process.cwd(), "storage", "attachments");

function resolveStorageDir(): string {
  return process.env.ATTACHMENT_STORAGE_DIR
    ? path.resolve(process.env.ATTACHMENT_STORAGE_DIR)
    : defaultDir;
}

function safeJoin(baseDir: string, storageKey: string): string {
  const fullPath = path.resolve(baseDir, storageKey);
  if (!fullPath.startsWith(baseDir)) {
    throw new Error("Invalid storage key path traversal");
  }
  return fullPath;
}

export async function writeAttachmentObject(storageKey: string, bytes: Buffer): Promise<string> {
  const baseDir = resolveStorageDir();
  await fs.mkdir(baseDir, { recursive: true });
  const targetPath = safeJoin(baseDir, storageKey);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, bytes);
  return targetPath;
}

export async function readAttachmentObject(storageKey: string): Promise<Buffer | null> {
  const baseDir = resolveStorageDir();
  const targetPath = safeJoin(baseDir, storageKey);
  try {
    return await fs.readFile(targetPath);
  } catch {
    return null;
  }
}

export async function attachmentObjectExists(storageKey: string): Promise<boolean> {
  const baseDir = resolveStorageDir();
  const targetPath = safeJoin(baseDir, storageKey);
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteAttachmentObject(storageKey: string): Promise<void> {
  const baseDir = resolveStorageDir();
  const targetPath = safeJoin(baseDir, storageKey);
  try {
    await fs.unlink(targetPath);
  } catch {
    // no-op for missing object
  }
}
