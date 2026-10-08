import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import pg from "pg";

const require = createRequire(import.meta.url);

async function isReady(connectionString) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch (error) {
    // Restart only an unavailable server; credentials/configuration errors need fixing.
    if (error.code === "ECONNREFUSED") return false;
    throw new Error(`Local database check failed (${error.code ?? "unknown error"}). Check DATABASE_URL.`);
  } finally {
    await client.end();
  }
}

function startDatabase() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      require.resolve("prisma/build/index.js"),
      "dev", "--name", "teacher-app", "--detach",
      "--port", "51213", "--db-port", "51214", "--shadow-db-port", "51215",
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });
    let output = "";
    for (const pipe of [child.stdout, child.stderr]) {
      pipe.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4000); });
    }
    child.once("error", () => reject(new Error("Unable to launch Prisma. Run npm run db:local for details.")));
    child.once("close", (code) => {
      if (code === 0) return resolve();
      const details = output.replace(/(?:postgres(?:ql)?|prisma\+postgres):\/\/[^\s]+/gi, "[database URL]").trim();
      reject(new Error(`Prisma could not start the local database. Run npm run db:local for details.\n${details}`));
    });
  });
}

async function main() {
  // Match the environment that `next dev` will use, including .env.local overrides.
  nextEnv.loadEnvConfig(process.cwd(), true);
  if (!process.env.DATABASE_URL) return;

  let url;
  try {
    url = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  // Only this project's named Prisma development database is managed here.
  // Other local PostgreSQL servers and remote databases retain their own lifecycle.
  const managedDatabase =
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.port === "51214" && url.pathname === "/template1";
  if (!managedDatabase) return;

  if (await isReady(process.env.DATABASE_URL)) {
    console.log("Local development database is ready.");
    return;
  }

  console.log("Starting the teacher-app local development database...");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await startDatabase();
      break;
    } catch (error) {
      // A just-stopped daemon can still be releasing ports; another starter may also win.
      if (await isReady(process.env.DATABASE_URL)) break;
      if (attempt === 1) throw error;
      console.log("Retrying local database startup...");
      await delay(1000);
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isReady(process.env.DATABASE_URL)) {
      console.log("Local development database is ready.");
      return;
    }
    await delay(500);
  }
  throw new Error("Local database did not become ready. Run npm run db:local for details.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
