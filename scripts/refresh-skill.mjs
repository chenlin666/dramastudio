#!/usr/bin/env node

// Refresh a locally installed DramaStudio Skill from the canonical GitHub repository.
// No credentials, no dependencies. Run from anywhere; paths resolve relative to this script.
// `node scripts/refresh-skill.mjs --check` reports drift without writing anything.

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "chenlin666/dramastudio";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPOSITORY}/${BRANCH}`;
const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FILE_BYTES = 512 * 1024;
const TIMEOUT_MS = 20_000;

const CANONICAL_FILES = [
  {
    relativePath: "SKILL.md",
    validate: (text) => /^---\nname:\s*dramastudio\b/m.test(text) && text.includes("DramaStudio external tools"),
  },
  {
    relativePath: "references/connection.md",
    validate: (text) => text.includes("Connection details") && text.includes("Streamable HTTP"),
  },
  {
    relativePath: "scripts/mcp-client.mjs",
    validate: (text) => text.startsWith("#!/usr/bin/env node") && text.includes("DRAMASTUDIO_API_KEY"),
    mode: 0o755,
  },
];

const checkOnly = process.argv.slice(2).includes("--check");

async function fetchCanonical(relativePath) {
  const response = await fetch(`${RAW_BASE}/${relativePath}`, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${relativePath}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
    throw new Error(`${relativePath} is unexpectedly large`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw new Error(`${relativePath} is unexpectedly large`);
  return text;
}

async function readLocal(relativePath) {
  try {
    return await readFile(path.join(SKILL_ROOT, relativePath), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  if (process.env.DRAMASTUDIO_SKILL_OFFLINE === "1") {
    console.log("DramaStudio Skill refresh skipped (offline mode). Local copy may be stale.");
    return;
  }

  const updates = [];
  for (const file of CANONICAL_FILES) {
    const remote = await fetchCanonical(file.relativePath);
    if (!file.validate(remote)) throw new Error(`${file.relativePath} failed canonical-content validation`);
    const local = await readLocal(file.relativePath);
    updates.push({ ...file, remote, changed: local !== remote });
  }

  if (checkOnly) {
    for (const file of updates) console.log(`${file.changed ? "differs" : "current"}: ${file.relativePath}`);
    if (updates.some((file) => file.changed)) process.exitCode = 2;
    return;
  }

  // All files were fetched and validated before any write, so a network failure cannot leave a half-updated Skill.
  for (const file of updates.filter((item) => item.changed)) {
    const target = path.join(SKILL_ROOT, file.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, file.remote, "utf8");
    if (file.mode !== undefined) await chmod(temporary, file.mode);
    await rename(temporary, target);
    console.log(`updated: ${file.relativePath}`);
  }
  if (updates.every((file) => !file.changed)) console.log("DramaStudio Skill is already current.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown refresh failure";
  console.error(`DramaStudio Skill refresh failed: ${message}. Existing local files were left untouched.`);
  process.exitCode = 1;
});
