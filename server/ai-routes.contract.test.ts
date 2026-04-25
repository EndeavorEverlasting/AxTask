// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const aiRoutesPath = path.join(projectRoot, "server", "routes", "ai.ts");
const routesPath = path.join(projectRoot, "server", "routes.ts");

describe("AI routes contract", () => {
  it("registers interpret and execute endpoints", () => {
    const aiRoutes = fs.readFileSync(aiRoutesPath, "utf8");
    expect(aiRoutes).toContain('app.post("/api/ai/interpret"');
    expect(aiRoutes).toContain('app.post("/api/ai/execute"');
  });

  it("wires AI route registrar into main router", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerAiRoutes } from "./routes/ai";');
    expect(routes).toContain("registerAiRoutes(app, requireAuth);");
  });
});
