import { spawn, execFile } from "node:child_process";
import { promises as fs, openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "dotenv";

const require = createRequire(import.meta.url);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPort = 3001;
const localOrigin = `http://127.0.0.1:${localPort}`;
const envFile = path.join(workspace, ".env.local");
const runtime = path.join(process.env.LOCALAPPDATA ?? "", "teacher-app", "public-preview");
const stateFile = path.join(runtime, "state.json");
const lockFile = path.join(runtime, "operation.lock");
const tunnelLog = path.join(runtime, "tunnel.log");
const serverLog = path.join(runtime, "server.log");
const binary = path.join(process.env.LOCALAPPDATA ?? "", "teacher-app", "tools", "cloudflared.exe");
const nextCli = require.resolve("next/dist/bin/next");
const publicAssignment = /^[\t ]*(?:export[\t ]+)?CLASSROOM_PUBLIC_URL[\t ]*=[^\r\n]*(?:\r?\n|$)/gm;
const execFileAsync = promisify(execFile);

async function powershell(script) {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64"),
  ], { windowsHide: true, timeout: 60_000, maxBuffer: 64_000 });
  return stdout.trim();
}

// Never print/store process command lines: retain a hash plus creation time and path.
async function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const output = await powershell(`
    $previewProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'
    if ($null -ne $previewProcess) {
      $previewHash = [System.Security.Cryptography.SHA256]::Create()
      $previewFingerprint = [BitConverter]::ToString($previewHash.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$previewProcess.CommandLine)))
      @{ pid = ${pid}; created = $previewProcess.CreationDate.ToUniversalTime().ToString('o'); executable = $previewProcess.ExecutablePath; fingerprint = $previewFingerprint } | ConvertTo-Json -Compress
    }
  `);
  return output ? JSON.parse(output) : null;
}

async function matches(record) {
  if (!record) return false;
  const actual = await identity(record.pid);
  return actual !== null && ["created", "executable", "fingerprint"].every((key) => actual[key] === record[key]);
}

function running(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function stopOwned(record) {
  if (await matches(record)) process.kill(record.pid);
}

async function read(file, fallback = "") {
  try { return await fs.readFile(file, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readState() {
  const source = await read(stateFile);
  const state = source ? JSON.parse(source) : null;
  if (state && state.workspace !== workspace) throw new Error("Public preview state belongs to another workspace; refusing to change its processes.");
  return state;
}

async function save(state) {
  const temporary = `${stateFile}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2));
  await fs.rename(temporary, stateFile);
}

async function writeEnv(source) {
  // Keep the temporary credentials file ignored, then replace the environment atomically.
  const temporary = path.join(workspace, `.env.public-preview-${process.pid}.local`);
  try {
    await fs.writeFile(temporary, source);
    await fs.rename(temporary, envFile);
  } finally {
    await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

async function clearUrl(url) {
  const source = await read(envFile);
  if (parse(source).CLASSROOM_PUBLIC_URL === url) await writeEnv(source.replace(publicAssignment, ""));
}

async function setUrl(url) {
  const source = await read(envFile);
  const previous = source.match(publicAssignment) ?? [];
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const updated = previous.length
    ? source.replace(publicAssignment, (line) => line.replace(
      /^([\t ]*(?:export[\t ]+)?CLASSROOM_PUBLIC_URL[\t ]*=[\t ]*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^#\r\n]*?)([\t ]*(?:#[^\r\n]*)?(?:\r?\n)?$)/,
      (_, prefix, suffix) => `${prefix}${url}${suffix}`,
    ))
    : `${source}${source && !source.endsWith("\n") ? newline : ""}CLASSROOM_PUBLIC_URL=${url}${newline}`;
  await writeEnv(updated);
  return previous;
}

async function restoreUrl(url, previous) {
  const source = await read(envFile);
  if (parse(source).CLASSROOM_PUBLIC_URL !== url) return;
  let index = 0;
  await writeEnv(source.replace(publicAssignment, () => previous[index++] ?? ""));
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: workspace, windowsHide: true, stdio: "inherit" });
    child.once("error", () => reject(new Error("Could not launch the local database/build command.")));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Preparation failed with exit code ${code}.`)));
  });
}

async function spawnPersistent(executable, args, logfile, environment = process.env) {
  const descriptor = openSync(logfile, "a");
  let child;
  try {
    child = spawn(executable, args, {
      cwd: workspace, env: environment, detached: true, windowsHide: true, stdio: ["ignore", descriptor, descriptor],
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () => reject(new Error(`Could not start ${path.basename(executable)}. See ${logfile}.`)));
    });
    child.unref();
    const record = await identity(child.pid);
    if (!record) throw new Error(`Preview process exited early. See ${logfile}.`);
    return record;
  } catch (error) {
    if (child?.pid && running(child.pid)) child.kill();
    throw error;
  } finally { closeSync(descriptor); }
}

async function waitFor(check, message, timeout = 120_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(750);
  }
  throw new Error(`${message} See logs in ${runtime}.`);
}

async function homepageReady(origin) {
  try {
    const response = await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    return response.ok && body.includes("/_next/") && body.includes("/sign-in");
  } catch { return false; }
}

async function checkPort() {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Port ${localPort} is occupied. Stop that process or the existing public preview first.`)));
    server.listen(localPort, "127.0.0.1", () => server.close(resolve));
  });
}

async function start(skipBuild) {
  const existing = await readState();
  if (existing) {
    const [serverAlive, tunnelAlive] = await Promise.all([matches(existing.server), matches(existing.tunnel)]);
    if (serverAlive && tunnelAlive) {
      if (!(await homepageReady(existing.url))) throw new Error("The existing preview is running but its public URL is unavailable. Check public:status or restart the preview.");
      console.log(`Public preview is already running: ${existing.url}`);
      return;
    }
    await stopOwned(existing.tunnel);
    await stopOwned(existing.server);
    await clearUrl(existing.url);
    await fs.unlink(stateFile);
  }
  await fs.access(binary).catch(() => { throw new Error(`cloudflared is missing. Install the Windows cloudflared binary at ${binary}.`); });
  await checkPort();
  await runNode([path.join(workspace, "scripts", "ensure-local-database.mjs")]);
  if (!skipBuild) await runNode([path.join(workspace, "scripts", "build.mjs")]);
  await fs.access(path.join(workspace, ".next", "BUILD_ID")).catch(() => { throw new Error("A production build is required. Run npm run build, or omit --skip-build."); });
  await fs.writeFile(tunnelLog, "");
  await fs.writeFile(serverLog, "");
  const state = { workspace, localPort, localOrigin, url: null, tunnel: null, server: null };
  let previous;
  try {
    state.tunnel = await spawnPersistent(binary, [
      "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", localOrigin,
    ], tunnelLog);
    await save(state);
    state.url = await waitFor(async () => {
      if (!running(state.tunnel.pid)) throw new Error(`Cloudflare Tunnel exited. See ${tunnelLog}.`);
      return (await read(tunnelLog)).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
    }, "Cloudflare did not allocate a public HTTPS URL.");
    await save(state);
    previous = await setUrl(state.url);
    state.server = await spawnPersistent(process.execPath, [nextCli, "start", "-H", "127.0.0.1", "-p", String(localPort)], serverLog, {
      ...process.env, NODE_ENV: "production", CLASSROOM_PUBLIC_URL: state.url,
    });
    await save(state);
    await waitFor(async () => {
      if (!running(state.tunnel.pid) || !running(state.server.pid)) throw new Error(`A preview process exited. See logs in ${runtime}.`);
      return (await read(tunnelLog)).includes("Registered tunnel connection") && await homepageReady(localOrigin) && await homepageReady(state.url);
    }, "The application or public HTTPS tunnel did not become ready.");
    console.log(`Public preview ready: ${state.url}\nCLASSROOM_PUBLIC_URL is configured. Keep this computer online. Stop with npm run public:stop.`);
  } catch (error) {
    await stopOwned(state.tunnel);
    await stopOwned(state.server);
    if (previous) await restoreUrl(state.url, previous);
    await fs.unlink(stateFile).catch((failure) => { if (failure.code !== "ENOENT") throw failure; });
    throw error;
  }
}

async function stop() {
  const state = await readState();
  if (!state) { console.log("No tracked public preview is running."); return; }
  await stopOwned(state.tunnel);
  await stopOwned(state.server);
  await clearUrl(state.url);
  await fs.unlink(stateFile);
  console.log("Public preview stopped. Local development and PostgreSQL remain available.");
}

async function status() {
  const state = await readState();
  if (!state) { console.log("No tracked public preview is running."); return; }
  const [server, tunnel] = await Promise.all([matches(state.server), matches(state.tunnel)]);
  console.log(`URL: ${state.url ?? "pending"}\nProduction server: ${server ? "running" : "stopped"}\nHTTPS tunnel: ${tunnel ? "running" : "stopped"}\nLogs: ${runtime}`);
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (!["start", "stop", "status"].includes(command) || flags.some((flag) => flag !== "--skip-build") || (command !== "start" && flags.length)) {
    throw new Error("Usage: node scripts/public-preview.mjs start [--skip-build] | stop | status");
  }
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) throw new Error("This public preview launcher requires Windows and LOCALAPPDATA.");
  await fs.mkdir(runtime, { recursive: true });
  if (command === "status") { await status(); return; }
  let lock;
  try {
    lock = await fs.open(lockFile, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = Number(await read(lockFile));
    if (Number.isSafeInteger(owner) && running(owner)) throw new Error("Another public preview operation is running. Wait for it to finish.");
    await fs.unlink(lockFile);
    lock = await fs.open(lockFile, "wx");
  }
  try {
    await lock.writeFile(String(process.pid));
    if (command === "start") await start(flags.includes("--skip-build"));
    else await stop();
  } finally {
    await lock.close();
    await fs.unlink(lockFile);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
