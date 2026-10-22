import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, "..");

test("production deployment exposes only the custom domain", async () => {
  const config = JSON.parse(await readFile(path.join(workerRoot, "wrangler.jsonc"), "utf8"));

  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, [
    {
      pattern: "api.drivinggodj.dpdns.org",
      custom_domain: true,
    },
  ]);
});

test("the tunnel watchdog checks the custom production endpoint", async () => {
  const script = await readFile(
    path.join(workerRoot, "scripts", "tunnel-watchdog.sh"),
    "utf8",
  );

  assert.match(script, /HEALTH_URL="https:\/\/api\.drivinggodj\.dpdns\.org\/api\/health"/);
  assert.match(script, /TUNNEL_LABEL="com\.drivinggodj\.shiguang-memory-tunnel"/);
  assert.doesNotMatch(script, /workers\.dev/);
  assert.doesNotMatch(script, /bilishelf/);
});

test("the tunnel installer uses QUIC as required by Workers VPC", async () => {
  const installer = await readFile(path.join(workerRoot, "scripts", "install-macos-service.mjs"), "utf8");
  assert.match(installer, /"--protocol", "quic"/);
  assert.doesNotMatch(installer, /"--protocol", "http2"/);
});
