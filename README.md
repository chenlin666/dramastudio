# DramaStudio Agent Skill

让有工具执行能力的 AI Agent 使用 DramaStudio 的远程 MCP：查询本人项目和画布、创建独立文本/脚本节点、预估费用，并在用户明确授权后提交图片或视频生成。视频支持文生、首帧、首＋尾帧和参考图模式，具体能力以每个模型的 `videoModes` 为准。

> 仓库提供的是**客户端 Skill 与本地脚本**，不是 MCP 服务端，也不会自动创建 API Key、安装 MCP 或获取付费权限。站点服务是否可用以 DramaStudio 实际部署为准。

## 仓库结构

```text
dramastudio/
├── SKILL.md                  # Agent Skills 入口与安全操作流程
├── references/connection.md # MCP 工具、连接方式及客户端示例
└── scripts/mcp-client.mjs    # 无额外依赖的 Node.js 22+ 本地回退脚本
```

**请安装整个 `dramastudio/` 目录，而不只是 `SKILL.md`；仓库根目录不是 Skill 目录。**安装前先审查全部三个文件，按你的 Agent 宿主文档放入用户级 Skills 目录。纯聊天环境或不允许安装工具的宿主不能仅凭粘贴 Skill 获得执行能力。

## 测试

```text
tests/
└── mcp-client.test.mjs
```

使用 Node.js 22+ 内置测试运行器；测试只连接本地 MCP mock，不请求真实服务或付费 API：

```sh
node --test tests/mcp-client.test.mjs
```

## 接入步骤

1. 在 [DramaStudio API Key 页面](https://dramastudio.dexiao.ai/settings/api-keys) **自行登录并创建 Key**。默认仅授予 `read`；需要读取私有画布则显式授予 `canvas.read`，需要创建独立 TEXT/SCRIPT 节点则授予 `canvas.write`，付费生成则另授予 `generate` 并设置合适每日预算。四种权限互不自动继承，旧 Key 不会自动扩权。Key 只显示一次，现有 Key 的权限和预算不能直接修改。
2. 仅在宿主的**私密凭证设置或受保护的本地环境**录入 Key，不要放进对话、提示词、仓库文件、命令参数或共享配置。优先将宿主原生 MCP 客户端连接到 `https://dramastudio.dexiao.ai/api/mcp`，选择 Streamable HTTP，用私密凭证提供 `Authorization: Bearer` 请求头。也可以使用登录后 [接入指南](https://dramastudio.dexiao.ai/settings/api-keys/guide) 展示的当前站点 MCP 地址。
3. 如果宿主没有兼容的原生远程 MCP，但有可信的本地 Node.js 22+ Shell，可在用户**私密注入** `DRAMASTUDIO_API_KEY` 后运行 `node dramastudio/scripts/mcp-client.mjs list-tools`。需要连接非默认站点时，只在用户确认其所属域名后设置 `DRAMASTUDIO_MCP_URL`；脚本仍只请求该站点的 `/api/mcp`。
4. 用 `tools/list` 和一项**只读**工具（如 `list_creation_templates` / `list_projects`）验证。`generate`-only Key 可用 `list_generation_models`，`canvas.write`-only Key 只检查 `tools/list` 是否包含 `create_canvas_node`。**不要**通过创建节点或提交付费任务测试连接。

安装 Skill 不等于 MCP 已连接；没有私密输入机制或执行权限时，请停下并提示用户手动配置。只支持 OAuth、不能自定义 Bearer 请求头的宿主不能直接连接；本项目目前不提供 MCP OAuth 或单独的浏览器授权登录。

## 付费操作边界

- `read` 可查询本人项目、素材、任务与模板目录；`canvas.read` 可读取本人画布节点、连线和受限素材预览，但不能执行任务查询；`canvas.write` 仅能在本人已有项目中幂等创建独立 TEXT/SCRIPT 节点，不能编辑、连线、运行或删除。模板发现**不会**运行模板工作流，使用模板须在浏览器里继续。
- 视频按用户意图选模型支持的模式：`text_to_video`、`first_frame`、`first_last_frame`、`reference_images`。图片生成完成后先用 `get_task_status` 取得真实的 `outputs[].assetId` 与 `projectId`；后续视频估价/提交只传**同一项目已就绪**的图片 Asset ID，不传输出 URL，也无需 `canvas.write` 或画布连线。只有尾帧、跨项目图片或模型不支持时应明确说明，不能静默转成文生。首尾帧目前仅向有独立端点的 Veo/Vidu 开放。
- 提交图片/视频前先调用 `list_generation_models` 核对参数和 `videoModes`，再以预期模式、同一组图片 Asset ID、数量等参数调用 `estimate_generation`。向用户展示模型、提示词、图片顺序、数量、预估积分，取得**该次提交的明确同意**；随后使用不低于估价且不高于批准额度的 `maxCredits`，以及该次请求稳定的 `idempotencyKey`。一个任务可按模型支持的 `count` 生成多个计费结果；`maxCredits` 不是人工确认。
- 新 Key 默认预算最高 5,000 credits/UTC 日；所有 Key 共用用户级 5,000 credits/日上限，并受账户余额、单 Key 预算及限速约束。持有 `generate` Key 的客户端在限额内可直接提交付费任务，服务端不会逐次弹窗确认。

具体工具与示例见 [`dramastudio/SKILL.md`](dramastudio/SKILL.md) 和 [`dramastudio/references/connection.md`](dramastudio/references/connection.md)。
