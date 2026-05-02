// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { tasks } from "@shared/schema";

const root = path.resolve(__dirname, "..");

function read(p: string): string {
  return fs.readFileSync(path.join(root, p), "utf8");
}

function colNames(table: Parameters<typeof getTableColumns>[0]): Set<string> {
  return new Set(Object.values(getTableColumns(table)).map((c) => c.name));
}

describe("soft delete contract", () => {
  it("schema has soft-delete columns", () => {
    const names = colNames(tasks);
    for (const col of ["deleted_at", "deleted_by", "delete_reason", "purge_after", "restore_count"]) {
      expect(names.has(col), `tasks missing column: ${col}`).toBe(true);
    }
  });

  it("migration 0041 exists", () => {
    expect(fs.existsSync(path.join(root, "migrations", "0041_task_soft_delete.sql"))).toBe(true);
  });

  it("routes expose trash, restore, and purge", () => {
    const routes = read("server/routes.ts");
    expect(routes).toContain('app.get("/api/tasks/trash"');
    expect(routes).toContain('app.post("/api/tasks/:id/restore"');
    expect(routes).toContain('app.delete("/api/tasks/:id/purge"');
  });

  it("storage interface declares restoreTask, purgeTask, getDeletedTasks", () => {
    const storage = read("server/storage.ts");
    expect(storage).toContain("restoreTask(userId: string, id: string)");
    expect(storage).toContain("purgeTask(userId: string, id: string)");
    expect(storage).toContain("getDeletedTasks(userId: string)");
  });

  it("all active-list queries exclude deleted tasks", () => {
    const storage = read("server/storage.ts");
    const activeMethods = [
      "async getTasks",
      "async getTask",
      "async getTasksByStatus",
      "async getTasksByPriority",
      "async searchTasks",
      "async updateTask",
      "async reorderTasks",
    ];
    for (const m of activeMethods) {
      const idx = storage.indexOf(m);
      expect(idx, `${m} missing from storage`).toBeGreaterThan(-1);
      const window = storage.slice(idx, idx + 500);
      expect(window, `${m} must filter deletedAt`).toMatch(/isNull\(tasks\.deletedAt\)|deleted_at IS NULL/);
    }
  });

  it("getTaskStats excludes deleted tasks", () => {
    const storage = read("server/storage.ts");
    const idx = storage.indexOf("async getTaskStats");
    expect(idx).toBeGreaterThan(-1);
    const window = storage.slice(idx, idx + 600);
    expect(window).toMatch(/isNull\(tasks\.deletedAt\)|deleted_at IS NULL/);
  });

  it("trash page is wired in App.tsx", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('"/trash"');
    expect(app).toContain("TrashPage");
  });

  it("sidebar includes Trash link", () => {
    const sidebar = read("client/src/components/layout/sidebar.tsx");
    expect(sidebar).toContain('"/trash"');
  });
});
