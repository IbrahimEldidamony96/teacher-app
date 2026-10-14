import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

export function prismaPgPoolConfig(connectionString) {
  const config = { connectionString };
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return config;
  }
  if (["postgres:", "postgresql:"].includes(url.protocol)
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && url.pathname === "/template1") {
    // Prisma Dev uses single-connection PGlite. Concurrent clients can collide
    // on unnamed prepared statements (PostgreSQL 08P01 / Prisma P2039).
    config.max = 1;
  } else if (["postgres:", "postgresql:"].includes(url.protocol)
    && url.hostname.endsWith(".neon.tech")
    && url.hostname.includes("-pooler.")) {
    // Vercel creates many short-lived server instances. Limit TCP connections
    // per instance even when the Neon endpoint uses PgBouncer pooling.
    config.max = 3;
    config.idleTimeoutMillis = 10_000;
    config.connectionTimeoutMillis = 10_000;
  }
  return config;
}

export class PrismaDevPool extends pg.Pool {
  async query(config) {
    const client = await this.connect();
    let releaseError;
    const onError = (error) => { releaseError ??= error; };
    // Checked-out clients no longer have the pool's idle error listener.
    client.on("error", onError);
    try {
      // A transaction pins the PGlite multiplexer to this connection until the
      // query finishes, including when a second app process shares the database.
      await client.query("BEGIN");
      const result = await client.query(config);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError ??= rollbackError;
      }
      throw error;
    } finally {
      client.removeListener("error", onError);
      client.release(releaseError);
    }
  }
}

export function createPrismaPgAdapter(connectionString) {
  const config = prismaPgPoolConfig(connectionString);
  if (config.max === 1) {
    // Prisma's explicit transactions acquire a client with connect() directly,
    // so only standalone queries use the transaction wrapper above.
    return new PrismaPg(new PrismaDevPool(config), { disposeExternalPool: true });
  }
  return new PrismaPg(config);
}
