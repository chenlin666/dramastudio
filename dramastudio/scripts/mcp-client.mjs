#!/usr/bin/env node

// A minimal local caller for DramaStudio's stateless JSON-response Streamable HTTP MCP endpoint.
// It does not accept credentials as arguments or persist them. Native MCP hosts are preferred.
const DEFAULT_ENDPOINT = "https://dramastudio.dexiao.ai/api/mcp";
const PROTOCOL_VERSION = "2025-11-25";
const ACCEPT = "application/json, text/event-stream";

function endpointUrl() {
  const url = new URL(process.env.DRAMASTUDIO_MCP_URL || DEFAULT_ENDPOINT);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/api/mcp") {
    throw new Error("DRAMASTUDIO_MCP_URL must be a verified HTTPS /api/mcp endpoint (HTTP only on localhost).");
  }
  return url.href;
}

async function post(endpoint, key, message, version) {
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: ACCEPT,
  };
  if (version) headers["MCP-Protocol-Version"] = version;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    let code = "MCP_REQUEST_FAILED";
    try {
      const body = await response.json();
      if (typeof body?.error?.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(body.error.code)) code = body.error.code;
    } catch {
      // Avoid printing raw HTTP bodies or request headers on failure.
    }
    const retry = response.headers.get("retry-after");
    throw new Error(`MCP HTTP ${response.status} (${code})${retry && /^\d+$/.test(retry) ? `; retry after ${retry}s` : ""}`);
  }
  if (message.id === undefined) return null; // initialized notification: 202 / no response body
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("MCP server did not return a JSON response.");
  }
  const body = await response.json();
  if (body?.jsonrpc !== "2.0" || body.id !== message.id) throw new Error("Invalid MCP JSON-RPC response.");
  if (body.error) throw new Error(`MCP JSON-RPC error ${String(body.error.code)}`);
  if (body.result === undefined) throw new Error("MCP response has no result.");
  return body.result;
}

async function main() {
  const [command, name, jsonArgs, ...extra] = process.argv.slice(2);
  if (extra.length || (command !== "list-tools" && command !== "call") || (command === "list-tools" && (name || jsonArgs)) || (command === "call" && (!name || !/^[a-z][a-z0-9_]{0,127}$/.test(name) || jsonArgs === undefined))) {
    throw new Error("Usage: node scripts/mcp-client.mjs list-tools | call <tool_name> '<JSON_object>'");
  }
  let args;
  if (command === "call") {
    try {
      args = JSON.parse(jsonArgs);
    } catch {
      throw new Error("Tool arguments must be a JSON object.");
    }
    if (args === null || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be a JSON object.");
  }
  const key = process.env.DRAMASTUDIO_API_KEY?.trim();
  if (!key) throw new Error("DRAMASTUDIO_API_KEY is missing. Create a Key at /settings/api-keys and inject it privately outside the conversation.");
  const endpoint = endpointUrl();
  const init = await post(endpoint, key, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "dramastudio-skill-client", version: "1.0.0" } },
  });
  const version = init?.protocolVersion;
  if (typeof version !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error("MCP server returned an invalid protocol version.");
  await post(endpoint, key, { jsonrpc: "2.0", method: "notifications/initialized" }, version);

  if (command === "list-tools") {
    const result = await post(endpoint, key, { jsonrpc: "2.0", id: 2, method: "tools/list" }, version);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const result = await post(endpoint, key, {
    jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args },
  }, version);
  console.log(JSON.stringify(result.structuredContent ?? result, null, 2));
  if (result.isError === true) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MCP request failed.");
  process.exitCode = 1;
});
