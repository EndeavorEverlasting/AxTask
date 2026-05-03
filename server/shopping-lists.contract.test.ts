// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "shopping-lists-routes.ts");

describe("collaborative shopping lists routes", () => {
  it("registers REST and export paths on shared lists", () => {
    const src = fs.readFileSync(routesPath, "utf8");
    expect(src).toContain('app.get("/api/shopping-lists"');
    expect(src).toContain('app.post("/api/shopping-lists"');
    expect(src).toContain('app.get("/api/shopping-lists/:listId/items"');
    expect(src).toContain('app.post("/api/shopping-lists/:listId/items/reorder"');
    expect(src).toContain('app.post("/api/shopping-lists/:listId/export/html"');
    expect(src).toContain('notifyShoppingListItemUpsert');
  });
});
