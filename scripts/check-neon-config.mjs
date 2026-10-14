import "dotenv/config";
import { pathToFileURL } from "node:url";

// Validation only: no database connections and no credentials printed.
export function validateNeonPair(runtime, direct, { shadow = null } = {}) {
  const errors = [];
  function parse(raw, label) {
    if (!raw) { errors.push(`${label} is missing.`); return null; }
    let url;
    try { url = new URL(raw); }
    catch { errors.push(`${label} is not a valid URL.`); return null; }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) errors.push(`${label} must use PostgreSQL.`);
    if (!url.hostname.endsWith(".neon.tech")) errors.push(`${label} must be a Neon database endpoint.`);
    if (url.searchParams.get("sslmode") !== "require") errors.push(`${label} requires sslmode=require.`);
    if (!url.pathname || url.pathname === "/") errors.push(`${label} must name a database.`);
    return url;
  }
  const pooled = parse(runtime, "DATABASE_URL");
  const unpooled = parse(direct, "DIRECT_URL");
  if (pooled && !pooled.hostname.includes("-pooler.")) errors.push("DATABASE_URL must be the pooled Neon endpoint.");
  if (unpooled && unpooled.hostname.includes("-pooler.")) errors.push("DIRECT_URL must use the direct Neon endpoint.");
  if (pooled && unpooled) {
    if (pooled.hostname.replace("-pooler.", ".") !== unpooled.hostname || pooled.pathname !== unpooled.pathname) {
      errors.push("DATABASE_URL and DIRECT_URL must target the same Neon branch and database.");
    }
  }
  if (shadow) {
    const other = parse(shadow, "SHADOW_DATABASE_URL");
    if (other && unpooled && other.hostname === unpooled.hostname && other.pathname === unpooled.pathname) {
      errors.push("SHADOW_DATABASE_URL must point to a separate disposable database/branch.");
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateNeonPair(process.env.DATABASE_URL, process.env.DIRECT_URL, { shadow: process.env.SHADOW_DATABASE_URL });
  if (errors.length) {
    for (const error of errors) console.error(`[Neon] ${error}`);
    process.exitCode = 1;
  } else {
    console.log("[Neon] Connection URL configuration looks consistent (no network connection was attempted).");
  }
}
