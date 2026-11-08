import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

async function readRepoText(...relativePath) {
  return readFile(path.join(repoRoot, ...relativePath), "utf8");
}

async function repoPathExists(...relativePath) {
  try {
    await access(path.join(repoRoot, ...relativePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("repo no longer includes the local backend project", async () => {
  assert.equal(await repoPathExists("backend"), false);
});

test("repo contains only the Shiguang web app, not the old extension or manager", async () => {
  assert.equal(await repoPathExists("extension"), false);
  assert.equal(await repoPathExists("frontend", "src", "manager-main.ts"), false);
  assert.equal(await repoPathExists("frontend", "src", "components"), false);
  assert.equal(await repoPathExists("frontend", "src", "stores"), false);
  assert.equal(await repoPathExists("frontend", "src", "memory", "MemoryApp.vue"), true);
});

test("frontend dev config no longer defaults to the removed local backend proxy", async () => {
  const viteConfigSource = await readRepoText("frontend", "vite.config.ts");

  assert.doesNotMatch(viteConfigSource, /127\.0\.0\.1:4321/);
});

test("current readmes no longer tell contributors to run backend commands", async () => {
  const readmeZh = await readRepoText("README.md");
  const readmeEn = await readRepoText("README.en.md");

  assert.doesNotMatch(readmeZh, /pnpm --dir backend/);
  assert.doesNotMatch(readmeZh, /backend\/\s+#/);
  assert.doesNotMatch(readmeEn, /pnpm --dir backend/);
  assert.doesNotMatch(readmeEn, /backend\/\s+# API service/);
});

test("public docs use only the custom production endpoint and neutral folder examples", async () => {
  const readmeZh = await readRepoText("README.md");
  const deploymentGuide = await readRepoText("MEMORY_WEB.md");
  const usageGuide = await readRepoText("docs", "GUIDE.zh-CN.md");
  const publicDocs = `${readmeZh}\n${deploymentGuide}\n${usageGuide}`;

  assert.doesNotMatch(publicDocs, /bilishelf-memory-proxy\.workers\.dev/);
  assert.doesNotMatch(publicDocs, /bilibili\.com\/list\/ml\d+/);
  assert.match(usageGuide, /ml\{收藏夹ID\}/);
});
