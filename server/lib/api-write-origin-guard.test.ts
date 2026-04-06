// @vitest-environment node
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiWriteOriginGuard } from "./api-write-origin-guard";

describe("createApiWriteOriginGuard", () => {
  function appWithGuard(allowed: Set<string>, forceHttps: boolean) {
    const app = express();
    app.use(createApiWriteOriginGuard(allowed, forceHttps));
    app.post("/api/auth/login", (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it("allows POST from http://localhost:5000 when forceHttps is false (Docker / local prod)", async () => {
    const app = appWithGuard(new Set(["https://localhost"]), false);
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5000")
      .send({ email: "a@b.co", password: "x" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("blocks POST from random origins", async () => {
    const app = appWithGuard(new Set(["https://myapp.example"]), false);
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("invalid origin");
  });

  it("allows referer-only clients when referer origin is permitted", async () => {
    const app = appWithGuard(new Set(["https://localhost"]), false);
    const res = await request(app)
      .post("/api/auth/login")
      .set("Referer", "http://127.0.0.1:5000/sign-in")
      .send({});
    expect(res.status).toBe(200);
  });

  it("allows POST when Origin and Referer are both absent", async () => {
    const app = appWithGuard(new Set(["https://localhost"]), false);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.co", password: "x" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("blocks http localhost when forceHttps is true", async () => {
    const app = appWithGuard(new Set(["https://localhost"]), true);
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5000")
      .send({});
    expect(res.status).toBe(403);
  });

  it("skips guard for GET (CSRF bootstrap / auth/me)", async () => {
    const app = express();
    app.use(createApiWriteOriginGuard(new Set(), true));
    app.get("/api/auth/me", (_req, res) => res.json({ user: null }));
    const res = await request(app).get("/api/auth/me").set("Origin", "http://evil.com");
    expect(res.status).toBe(200);
  });
});
