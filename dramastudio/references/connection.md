# Connection details (load only when needed)

## Which path works?

| Agent capabilities | Integration |
| --- | --- |
| Can configure remote Streamable HTTP MCP with a custom Bearer header | Prefer persistent user-level MCP configuration; load the Key through the host's private secret setting or environment reference. `tools/list` works without installing a Skill. |
| Has a trusted local shell with Node.js 22+, but lacks native compatible MCP | Use `../scripts/mcp-client.mjs` to send MCP JSON-RPC requests. Install this entire Skill directory so the script is available. |
| Only a browser/chat interface without MCP/HTTP tools, private credential input, or a shell | Cannot self-install or make authenticated calls. Tell the user which capability is missing. GitHub availability alone does not change this. |

The user signs in at `https://dramastudio.dexiao.ai/settings/api-keys` and creates a **user API Key** there. No separate CLI/browser login, OAuth token exchange, package registry listing, or standalone MCP deployment is required; the DramaStudio site must deploy its Key/MCP feature first. The official `/settings/api-keys/guide` displays the MCP URL for that site. The service is stateless; every request needs the Key. Do not use a different endpoint, hostname, or third-party proxy without the user's verification.

## Native MCP hosts

- MCP transport: **Streamable HTTP**, endpoint `https://dramastudio.dexiao.ai/api/mcp` on the production origin, or the same-origin URL in the user's signed-in guide.
- Authentication: `Authorization: Bearer <value from protected credential store>`. The placeholder is **not** a real Key. Never place a literal Key in a chat, config file that may be shared, project directory, shell command, browser URL, or commit.
- Prefer persistent **user-level** configuration and test with `tools/list` followed by a read-only tool. Do not run a paid test. If the client cannot substitute a protected secret in a custom header, report the limitation instead of pasting the Key into plain JSON.
- Pi (where its built-in MCP CLI is available) supports `pi mcp add dramastudio --url https://dramastudio.dexiao.ai/api/mcp --bearer-token-env-var DRAMASTUDIO_API_KEY`, then `pi mcp list` and `/reload`. The user must privately provide `DRAMASTUDIO_API_KEY` to Pi's environment first. Verify flags against the installed Pi version; this command stores the **variable name**, not the Key. Other hosts use different configuration formats: inspect their docs instead of guessing file locations or credential interpolation syntax.
- Browser-based MCP clients additionally need the deployment to allow their exact `Origin` for CORS preflight. Do not turn off browser security. An OAuth-only client that cannot provide a custom Bearer header is not directly supported.

## Shell fallback (no extra dependencies)

Requires an installed copy of this Skill, Node.js 22+, HTTPS network access and the user's **privately injected** `DRAMASTUDIO_API_KEY` environment variable. `DRAMASTUDIO_API_KEY` is the variable name, **not** the Key value. Do not ask the user to send the Key through the conversation or to put it on a command line. Run from the Skill directory (or resolve the script path relative to this file):

```sh
node scripts/mcp-client.mjs list-tools
node scripts/mcp-client.mjs call list_creation_templates '{"limit":2}'
# Only after the user has explicitly enabled the generate scope:
node scripts/mcp-client.mjs call list_generation_models '{}'
```

The script reads `DRAMASTUDIO_MCP_URL` only if the user has verified an alternative site origin; otherwise it uses the production endpoint. It sends `initialize`, `notifications/initialized`, then `tools/list` or `tools/call` over JSON-RPC (no session is persisted). It never takes the Key in command arguments and never prints the Key or Authorization header. Tool output can include task result URLs; do not publish them. HTTP 401 means missing/revoked/expired Key; HTTP 429 means a rate or budget limit (respect `Retry-After`). HTTP 405 on GET is expected: the endpoint uses POST.

## Tool use boundaries

| Permission | Tool | What it can do |
| --- | --- | --- |
| `read` or `canvas.read` | `list_creation_templates`, `list_projects`, `get_project_summary`, `list_assets` | Only browse accessible metadata; no Canvas mutation. |
| `canvas.read` | `list_canvas_nodes`, `list_canvas_edges`, `get_canvas_node` | Read the authorized user's current project graph, node text, prompts, storyboard rows with validated shot-to-image/video links, and ready asset IDs; paginated and limited, never raw node data or mutation. |
| `canvas.read` | `get_canvas_asset_preview` | Image-capable native MCP clients receive bounded image blocks; locked free images are watermarked. Unlocked R2 video supplies a URL only (private signature ~5 minutes, configured public URL without an expiry). Locked video, legacy external media and oversized images require a signed-in browser; not directly viewable by the agent. |
| `canvas.write` | `create_canvas_node` | Create one standalone top-level TEXT or SCRIPT node containing static text/limited storyboard rows in the user's existing project. Requires a stable user-scoped idempotencyKey; retries do not recreate deleted nodes. No project discovery, editing, links, media refs, runs, deletion, or credits. |
| `read` or `generate` | `get_task_status` | Returns limited status/results of the user's own task; may advance recovery/polling of an already-existing task, **not** create a new paid generation. |
| `generate` | `list_generation_models`, `estimate_generation` | Read model options and estimate cost; an estimate does not charge or reserve a budget. |
| `generate` | `submit_image_generation`, `submit_video_generation` | Can spend credits; text-to-image or video from a text prompt, first frame, first+last frames, or reference images. Model-supported `count` may produce multiple billable outputs in one call. Requires the user's per-request approval, server-valid `maxCredits` and `idempotencyKey`. |

Use the current JSON schemas from `tools/list` for exact parameters and `list_generation_models` for each model's supported ratio, resolution, quality, duration, count and audio options. An empty option list means the model does not accept that parameter; values outside the listed options are explicitly rejected, never silently downgraded. Image parameters are `ratio`, `imageResolution`, `imageQuality` (GPT Image 2 only) and supported `count`; video parameters are `ratio`, `duration`, `quality`, supported `generateAudio` and `count`. Video models list `videoModes` and `maxReferenceImages`: set `mode: "first_frame"` plus `firstFrameAssetId`, `mode: "first_last_frame"` plus ordered `firstFrameAssetId`/`lastFrameAssetId`, or `mode: "reference_images"` plus `referenceAssetIds`; default `text_to_video` accepts no images. Get actual `assetId`/`projectId` from a succeeded image task's `get_task_status.outputs`, and use the **same projectId** in video estimates and submissions. Inputs must be ready R2 image Assets in that project; no arbitrary URL, URL from task output, tail-only mode, cross-project input or unverified model/mode fallback. Do not request canvas.write or create a Canvas edge for this flow. Estimate with the exact intended mode, image IDs and options before submitting; the estimate's `defaults` are the values submission will use. Do not assume other `/api/ai` browser endpoints accept user API Keys. `canvas.read` alone does not expose `get_task_status` (it may adopt or drive existing tasks); `canvas.write` alone does not allow listing or reading projects. Existing `read` and `generate` Keys do not inherit canvas access. The shell script prints only `structuredContent` when the server returns image blocks: use an image-capable native MCP host for inline image pixels; the script is not a native tool registry or a media viewer. `estimate_generation` and model listing are not visible to a read-only Key. New Keys default to read-only; later paid operations require creating a **new** Key with `generate` explicitly selected and the desired daily budget set at creation. Existing scopes and budgets are not edited in place. No service-side human confirmation screen is provided for a generate Key. The daily per-Key (configurable up to 5,000 credits) and per-user (5,000 credits across Keys) UTC ceilings do not replace explicit approval.
