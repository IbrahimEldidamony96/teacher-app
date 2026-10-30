import { execFile, spawn } from "node:child_process";
import { lstat, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(workspace, ".next");
// Match Next's production cleanup exclusions, including an active dev server.
const preserved = /^(cache|dev|lock|trace)/;

async function misreportedDirectory(directory, root = true) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (root && preserved.test(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      // OneDrive cloud directories can be reported as links by readdir even
      // though lstat correctly identifies them as ordinary directories.
      const stat = await lstat(filename);
      if (stat.isDirectory() && !stat.isSymbolicLink()) return true;
    } else if (entry.isDirectory() && await misreportedDirectory(filename, false)) {
      return true;
    }
  }
  return false;
}

async function prepareWindowsBuild() {
  if (process.platform !== "win32") return;
  try {
    if ((await realpath(buildRoot)).toLowerCase() !== buildRoot.toLowerCase()) {
      throw new Error("Refusing to clean a .next directory outside this workspace.");
    }
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!await misreportedDirectory(buildRoot)) return;
  try {
    await lstat(path.join(buildRoot, "lock"));
    throw new Error("A Next.js build lock exists. Wait for the other build to finish before retrying.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  console.log("Cleaning OneDrive build artifacts with Windows filesystem tools...");
  const literalRoot = `'${buildRoot.replaceAll("'", "''")}'`;
  const script = `
    $ErrorActionPreference = 'Stop'
    $buildOutputRoot = [IO.Path]::GetFullPath(${literalRoot})
    $buildOutputPrefix = $buildOutputRoot + [IO.Path]::DirectorySeparatorChar
    foreach ($buildOutputEntry in Get-ChildItem -LiteralPath $buildOutputRoot -Force) {
      if ($buildOutputEntry.Name -match '^(cache|dev|lock|trace)') { continue }
      $buildOutputTarget = [IO.Path]::GetFullPath($buildOutputEntry.FullName)
      if (-not $buildOutputTarget.StartsWith($buildOutputPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to remove a build artifact outside .next.'
      }
      Remove-Item -LiteralPath $buildOutputTarget -Recurse -Force
    }
  `;
  await promisify(execFile)("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64"),
  ], { windowsHide: true, timeout: 60_000 });
}

try {
  await prepareWindowsBuild();
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build", ...process.argv.slice(2)], {
    cwd: workspace, stdio: "inherit", windowsHide: true,
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
