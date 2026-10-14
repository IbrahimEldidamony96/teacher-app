import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { PrismaDevPool, prismaPgPoolConfig } from "../src/lib/prisma-pool.js";

describe("Prisma PostgreSQL pool configuration", () => {
  it("uses one connection for local Prisma Dev databases, including isolated ports", () => {
    for (const connectionString of [
      "postgres://localhost:51214/template1",
      "postgresql://127.0.0.1:43219/template1?sslmode=disable",
      "postgres://[::1]:34567/template1",
    ]) {
      assert.deepEqual(prismaPgPoolConfig(connectionString), { connectionString, max: 1 });
    }
  });
  it("limits driver connections per Vercel instance for Neon pooled endpoints", () => {
    assert.deepEqual(
      prismaPgPoolConfig("postgresql://example:secret@ep-hello-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"),
      {
        connectionString: "postgresql://example:secret@ep-hello-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
        max: 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
      },
    );
    const direct = "postgresql://example:secret@ep-hello.us-east-1.aws.neon.tech/neondb?sslmode=require";
    assert.deepEqual(prismaPgPoolConfig(direct), { connectionString: direct });
  });

  it("keeps default pooling for external databases and other local databases", () => {
    for (const connectionString of [
      "postgres://db.example.invalid:51214/template1",
      "postgres://localhost.example.invalid:51214/template1",
      "postgres://localhost:51214/teacher_app",
      "postgres://127.0.0.1:5432/postgres",
      "postgres://[::1]:5432/template0",
      "https://localhost:51214/template1",
      "invalid connection URL",
      undefined,
    ]) {
      assert.deepEqual(prismaPgPoolConfig(connectionString), { connectionString });
    }
  });
});

it("handles an interrupted checked-out client and releases it with the original socket error", async () => {
  const pool = new PrismaDevPool({ max: 1 });
  const client = new EventEmitter();
  const socketError = new Error("Connection interrupted");
  const queryError = new Error("Query rejected after interruption");
  const rollbackError = new Error("Connection unavailable for rollback");
  const query = { text: "SELECT 1" };
  const calls = [];
  const releases = [];
  pool.connect = async () => client;
  client.query = async (config) => {
    calls.push(config);
    if (config === "BEGIN") return { rows: [] };
    if (config === "ROLLBACK") throw rollbackError;
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        client.emit("error", socketError);
        reject(queryError);
      });
    });
  };
  client.release = (error) => {
    assert.equal(client.listenerCount("error"), 0);
    releases.push(error);
  };
  try {
    await assert.rejects(pool.query(query), (error) => error === queryError);
    assert.deepEqual(calls, ["BEGIN", query, "ROLLBACK"]);
    assert.deepEqual(releases, [socketError]);
    assert.equal(client.listenerCount("error"), 0);
  } finally {
    await pool.end();
  }
});
