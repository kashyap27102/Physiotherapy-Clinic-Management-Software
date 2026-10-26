import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { AppError, parseInput } from "../src/lib/errors.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { z } from "zod";

const app = createApp();

describe("health and version", () => {
  it("answers liveness with a request id and no data", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports readiness as ok while no database is configured", async () => {
    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "not_configured" });
  });

  it("returns version info", async () => {
    const res = await request(app).get("/api/v1/version");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("physio-clinic-server");
  });
});

describe("error format (docs/API-Requirements.md section 2.1)", () => {
  it("answers unknown routes with NOT_FOUND and the request id", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("answers malformed JSON with BAD_REQUEST", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send('{"broken"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects oversized bodies", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("maps AppError, validation errors and unexpected errors without leaking internals", async () => {
    const probe = express();
    probe.use((req, _res, next) => {
      (req as unknown as { id: string }).id = "test-request-id";
      next();
    });
    probe.get("/app-error", () => {
      throw new AppError(
        409,
        "DUPLICATE_PATIENT_WARNING",
        "Possible duplicate.",
        { details: { candidates: [] } },
      );
    });
    probe.get("/invalid", () => {
      parseInput(
        z.object({
          phone: z
            .string()
            .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number."),
        }),
        { phone: "123" },
      );
    });
    probe.get("/boom", () => {
      throw new Error("database password is hunter2");
    });
    probe.use(errorHandler);

    const conflict = await request(probe).get("/app-error");
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatchObject({
      code: "DUPLICATE_PATIENT_WARNING",
      details: { candidates: [] },
      requestId: "test-request-id",
    });

    const invalid = await request(probe).get("/invalid");
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    expect(invalid.body.error.fields).toEqual([
      { field: "phone", message: "Enter a valid 10-digit mobile number." },
    ]);

    const boom = await request(probe).get("/boom");
    expect(boom.status).toBe(500);
    expect(boom.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(boom.body)).not.toContain("hunter2");
  });
});

describe("security headers and CORS", () => {
  it("sets hardening headers and hides the framework", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows the configured client origin only", async () => {
    const allowed = await request(app)
      .get("/api/v1/health")
      .set("Origin", "http://localhost:5173");
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("environment validation", () => {
  it("applies safe defaults", () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 4000,
      TRUST_PROXY: false,
      CORS_ORIGINS: ["http://localhost:5173"],
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("splits multiple CORS origins and treats an empty DATABASE_URL as unset", () => {
    const env = loadEnv({
      CORS_ORIGINS: "https://a.example, https://b.example",
      DATABASE_URL: "",
    });
    expect(env.CORS_ORIGINS).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("fails fast on bad values without echoing them", () => {
    expect(() => loadEnv({ PORT: "abc" })).toThrow(/PORT/);
    expect(() =>
      loadEnv({ DATABASE_URL: "mysql://secret-user:secret-pass@host/db" }),
    ).toThrow(/DATABASE_URL/);
    try {
      loadEnv({ DATABASE_URL: "mysql://secret-user:secret-pass@host/db" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-pass");
    }
  });
});
