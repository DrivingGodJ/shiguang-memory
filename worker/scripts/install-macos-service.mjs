import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

if (process.platform !== "darwin") throw new Error("This installer requires macOS");

const workerRoot = fileURLToPath(new URL("../", import.meta.url));
const serviceRoot = path.join(os.homedir(), "Library/Application Support/ShiguangMemory");
const runtimeRoot = path.join(serviceRoot, "runtime/worker");
const agentRoot = path.join(os.homedir(), "Library/LaunchAgents");
const savedAgentsRoot = path.join(serviceRoot, "launchagents");
const logRoot = path.join(os.homedir(), "Library/Logs/ShiguangMemory");
const tokenFile = path.join(serviceRoot, "secrets/tunnel-token");
const domain = `gui/${process.getuid()}`;

async function executable(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`Required executable not found: ${candidates[0]}`);
}

// Prefer Homebrew's stable links so a package upgrade does not break autostart.
const nodeBinary = await executable(["/opt/homebrew/bin/node", "/usr/local/bin/node", process.execPath]);
const tunnelBinary = await executable(["/opt/homebrew/bin/cloudflared", "/usr/local/bin/cloudflared"]);
const token = (await fs.readFile(tokenFile, "utf8").catch(() => "")).trim();
if (!token) throw new Error(`Save the existing Tunnel connector token privately to ${tokenFile} before installing`);
await fs.chmod(path.dirname(tokenFile), 0o700);
await fs.chmod(tokenFile, 0o600);

for (const directory of [agentRoot, savedAgentsRoot, logRoot, path.join(runtimeRoot, "src"), path.join(runtimeRoot, "scripts")]) {
  await fs.mkdir(directory, { recursive: true });
}

// Only update executable code. Existing UID statistics and secrets stay in place.
for (const file of ["index.js", "local-server.js", "uid-request-log.js"]) {
  await fs.copyFile(path.join(workerRoot, "src", file), path.join(runtimeRoot, "src", file));
}
await fs.copyFile(path.join(workerRoot, "package.json"), path.join(runtimeRoot, "package.json"));
await fs.copyFile(path.join(workerRoot, "scripts/tunnel-watchdog.sh"), path.join(runtimeRoot, "scripts/tunnel-watchdog.sh"));

const directEnvironment = {
  PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  HTTP_PROXY: "",
  HTTPS_PROXY: "",
  ALL_PROXY: "",
  http_proxy: "",
  https_proxy: "",
  all_proxy: "",
  NO_PROXY: "*",
  no_proxy: "*",
  NODE_USE_ENV_PROXY: "0",
};
const jobs = [
  {
    name: "proxy",
    Label: "com.drivinggodj.shiguang-memory-proxy",
    ProgramArguments: [nodeBinary, path.join(runtimeRoot, "src/local-server.js")],
    KeepAlive: true,
    ThrottleInterval: 10,
    logName: "mac-proxy",
  },
  {
    name: "tunnel",
    Label: "com.drivinggodj.shiguang-memory-tunnel",
    ProgramArguments: [tunnelBinary, "tunnel", "--no-autoupdate", "--protocol", "quic", "--loglevel", "warn", "run", "--token-file", tokenFile],
    KeepAlive: true,
    ThrottleInterval: 10,
    logName: "tunnel",
  },
  {
    name: "watchdog",
    Label: "com.drivinggodj.shiguang-memory-watchdog",
    ProgramArguments: ["/bin/zsh", path.join(runtimeRoot, "scripts/tunnel-watchdog.sh")],
    StartInterval: 120,
    logName: "watchdog",
  },
];

function xmlString(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function plistValue(value) {
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") return `<integer>${value}</integer>`;
  if (Array.isArray(value)) return `<array>${value.map(plistValue).join("")}</array>`;
  if (typeof value === "object") return `<dict>${Object.entries(value).map(([key, entry]) => `<key>${xmlString(key)}</key>${plistValue(entry)}`).join("")}</dict>`;
  return `<string>${xmlString(value)}</string>`;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args[0]} failed: ${result.stderr?.trim() || result.error?.message || result.status}`);
  }
}

async function loadAgent(plistFile) {
  // bootout returns before launchd has fully removed the old registration.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = spawnSync("/bin/launchctl", ["bootstrap", domain, plistFile], { encoding: "utf8" });
    if (!result.error && result.status === 0) return;
    if (result.error || result.status !== 5 || attempt === 19) {
      throw new Error(`Could not load ${plistFile}: ${result.stderr?.trim() || result.error?.message || result.status}`);
    }
    await delay(250);
  }
}

for (const { name, logName, ...job } of jobs) {
  const configuration = {
    ...job,
    RunAtLoad: true,
    WorkingDirectory: runtimeRoot,
    EnvironmentVariables: directEnvironment,
    StandardOutPath: path.join(logRoot, `${logName}.log`),
    StandardErrorPath: path.join(logRoot, `${logName}.error.log`),
  };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plistValue(configuration)}</plist>\n`;
  const installedFile = path.join(agentRoot, `${job.Label}.plist`);
  const savedFile = path.join(savedAgentsRoot, `${job.Label}.plist`);
  await fs.writeFile(savedFile, plist, { mode: 0o600 });
  run("/usr/bin/plutil", ["-lint", savedFile]);
  if (spawnSync("/bin/launchctl", ["print", `${domain}/${job.Label}`], { stdio: "ignore" }).status === 0) {
    run("/bin/launchctl", ["bootout", `${domain}/${job.Label}`]);
    await delay(250);
  }
  await fs.copyFile(savedFile, installedFile);
  run("/bin/launchctl", ["enable", `${domain}/${job.Label}`]);
  await loadAgent(installedFile);
  console.log(`Installed and loaded ${name}: ${job.Label}`);
}

console.log(`Login autostart is installed. Logs: ${logRoot}`);
