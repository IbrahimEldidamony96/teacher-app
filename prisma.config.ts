import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma CLI (migrate, db pull, introspect) must use Neon's DIRECT endpoint.
// Application queries use DATABASE_URL (pooled) in src/lib/prisma.js.
// Never run a destructive migration automatically during a Vercel build.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DIRECT_URL"),
    // Optional: a separate disposable Neon branch for 'prisma migrate dev'.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
