import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = join(REPO_ROOT, "dramastudio");
const CLIENT_PATH = join(SKILL_DIR, "scripts", "mcp-client.mjs");
const TEST_KEY = "private-test-key-not-a-real-credential";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runClient(args, env = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, DRAMASTUDIO_API_KEY: TEST_KEY, ...env };
    for (const [key, value] of Object.entries(childEnv)) {
      if (value === undefined) delete childEnv[key];
    }

    const child = spawn(process.execPath, [CLIENT_PATH, ...args], {
      cwd: REPO_ROOT,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

describe("public DramaStudio Agent Skill", () => {
  it("keeps repository, Skill, connection guide, and client references in sync without real credentials", () => {
    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
    const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
    const reference = readFileSync(join(SKILL_DIR, "references", "connection.md"), "utf8");
    const script = readFileSync(CLIENT_PATH, "utf8");

    assert.match(readme, /dramastudio\/SKILL\.md/);
    assert.match(readme, /dramastudio\/references\/connection\.md/);
    assert.match(readme, /node --test tests\/mcp-client\.test\.mjs/);
    assert.match(skill, /^---\nname: dramastudio\ndescription: /);
    const description = skill.match(/^description: (.+)$/m)?.[1];
    assert.ok(description && description.length < 700, "Skill 描述应简短并包含创作场景触发词");
    for (const phrase of ["AI images", "short dramas", "storyboard frames", "image-guided video", "without naming DramaStudio", "MCP", "explicit approval"]) {
      assert.ok(description.includes(phrase), `Skill 描述缺少创作触发词或授权边界：${phrase}`);
    }
    assert.match(skill, /## Create visual stories and short-drama shot assets/);
    assert.match(skill, /cannot automatically arrange them on the canvas, assemble clips, export a finished short drama/);
    assert.match(readme, /辅助短剧与视觉内容创作/);
    assert.match(skill, /https:\/\/github\.com\/chenlin666\/dramastudio/);
    for (const path of ["references/connection.md", "scripts/mcp-client.mjs"]) {
      assert.ok(skill.includes(path), `Skill 缺少 ${path}`);
    }
    for (const text of ["/settings/api-keys", "estimate_generation", "maxCredits", "idempotencyKey", "list_creation_templates", "user-level"]) {
      assert.ok(skill.includes(text), `Skill 缺少 ${text}`);
    }
    assert.match(reference, /Node\.js 22\+/);
    assert.match(reference, /node scripts\/mcp-client\.mjs list-tools/);
    assert.match(script, /process\.env\.DRAMASTUDIO_API_KEY/);
    assert.match(script, /redirect: "error"/);

    for (const file of [readme, skill, reference, script]) {
      assert.doesNotMatch(file, /llk_live_[A-Za-z0-9_-]+|github\.com\/<|Bearer llk_live_/);
    }
  });

  it("rejects missing credentials, unverified endpoints, and invalid arguments before requests, without echoing secrets", async () => {
    const withoutKey = await runClient(["list-tools"], { DRAMASTUDIO_API_KEY: undefined });
    assert.equal(withoutKey.status, 1);
    assert.match(withoutKey.stderr, /DRAMASTUDIO_API_KEY is missing/);

    const wrongEndpoint = await runClient(["list-tools"], { DRAMASTUDIO_MCP_URL: "https://other.example.test/other" });
    assert.equal(wrongEndpoint.status, 1);
    assert.match(wrongEndpoint.stderr, /verified HTTPS \/api\/mcp/);

    const invalidArguments = await runClient(["call", "list_projects", "[]"], { DRAMASTUDIO_MCP_URL: "http://127.0.0.1:9/api/mcp" });
    assert.equal(invalidArguments.status, 1);
    assert.match(invalidArguments.stderr, /JSON object/);

    for (const result of [withoutKey, wrongEndpoint, invalidArguments]) {
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_KEY));
    }
  });

  it("uses only an in-process mock MCP for handshake, read-only calls, and 429 handling", async () => {
    const requests = [];
    let rateLimited = false;
    const server = createServer(async (request, response) => {
      let raw = "";
      for await (const chunk of request) raw += String(chunk);
      const payload = JSON.parse(raw);
      if (!isRecord(payload) || typeof payload.method !== "string") {
        response.writeHead(400).end();
        return;
      }

      requests.push({
        method: payload.method,
        httpMethod: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        accept: request.headers.accept,
        protocolVersion: request.headers["mcp-protocol-version"],
        params: payload.params,
      });
      if (rateLimited) {
        response.writeHead(429, { "Content-Type": "application/json", "Retry-After": "12" });
        response.end(JSON.stringify({ error: { code: "EXTERNAL_API_RATE_LIMIT", message: "Do not echo raw error bodies." } }));
        return;
      }
      if (payload.method === "notifications/initialized") {
        response.writeHead(202).end();
        return;
      }

      let result;
      if (payload.method === "initialize") {
        result = { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "test", version: "1" } };
      } else if (payload.method === "tools/list") {
        result = { tools: [{ name: "list_projects", inputSchema: { type: "object" } }] };
      } else {
        result = { structuredContent: { projects: [{ id: "owned" }] } };
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const endpoint = `http://127.0.0.1:${address.port}/api/mcp`;

      const listed = await runClient(["list-tools"], { DRAMASTUDIO_MCP_URL: endpoint });
      assert.equal(listed.status, 0, listed.stderr);
      assert.deepEqual(JSON.parse(listed.stdout).tools.map((tool) => tool.name), ["list_projects"]);

      const called = await runClient(["call", "list_projects", '{"limit":1}'], { DRAMASTUDIO_MCP_URL: endpoint });
      assert.equal(called.status, 0, called.stderr);
      assert.deepEqual(JSON.parse(called.stdout), { projects: [{ id: "owned" }] });
      assert.deepEqual(requests.map((entry) => entry.method), [
        "initialize", "notifications/initialized", "tools/list",
        "initialize", "notifications/initialized", "tools/call",
      ]);
      assert.ok(requests.every((entry) => entry.httpMethod === "POST" && entry.url === "/api/mcp"));
      assert.ok(requests.every((entry) => entry.authorization === `Bearer ${TEST_KEY}`));
      assert.ok(requests.every((entry) => entry.accept?.includes("application/json") && entry.accept.includes("text/event-stream")));
      assert.ok(requests.filter((entry) => entry.method === "initialize").every((entry) => entry.protocolVersion === undefined));
      assert.ok(requests.filter((entry) => entry.method !== "initialize").every((entry) => entry.protocolVersion === "2025-11-25"));
      assert.deepEqual(requests[5].params, { name: "list_projects", arguments: { limit: 1 } });

      rateLimited = true;
      const limited = await runClient(["list-tools"], { DRAMASTUDIO_MCP_URL: endpoint });
      assert.equal(limited.status, 1);
      assert.match(limited.stderr, /MCP HTTP 429 \(EXTERNAL_API_RATE_LIMIT\); retry after 12s/);
      for (const result of [listed, called, limited]) {
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_KEY));
      }
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
