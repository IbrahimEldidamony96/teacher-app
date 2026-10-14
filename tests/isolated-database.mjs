import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { startPrismaDevServer } from "@prisma/dev";
import pg from "pg";

export async function availablePorts(count) {
  const sockets = [];
  try {
    for (let i = 0; i < count; i += 1) {
      const socket = createServer();
      await new Promise((resolve, reject) => {
        socket.once("error", reject);
        socket.listen(0, "127.0.0.1", resolve);
      });
      sockets.push(socket);
    }
    return sockets.map((socket) => socket.address().port);
  } finally {
    await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.close(resolve))));
  }
}

export async function isolatedDatabase(label, { stopBeforeMigration = null } = {}) {
  const [port, databasePort, shadowDatabasePort, streamsPort] = await availablePorts(4);
  const server = await startPrismaDevServer({
    name: `teacher-app-${label}-${process.pid}-${Date.now()}`,
    persistenceMode: "stateless", port, databasePort, shadowDatabasePort, streamsPort,
  });
  const connectionString = server.database.connectionString;
  const db = new pg.Client({ connectionString });
  try {
    await db.connect();
    const root = new URL("../prisma/migrations/", import.meta.url);
    const directories = (await readdir(root, { withFileTypes: true })).filter((row) => row.isDirectory()).map((row) => row.name).sort();
    for (const directory of directories) {
      if (stopBeforeMigration && directory >= stopBeforeMigration) break;
      await db.query(await readFile(new URL(`${directory}/migration.sql`, root), "utf8"));
    }
  } catch (error) {
    await server.close();
    throw error;
  } finally { await db.end(); }
  return { server, connectionString };
}
