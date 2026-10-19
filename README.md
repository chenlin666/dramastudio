# DramaStudio Agent Skill

让有工具执行能力的 AI Agent 使用 DramaStudio 的远程 MCP：查询本人项目、素材和创作模板，预估费用，并在用户明确授权后提交单次图片或视频生成任务。

> 仓库提供的是**客户端 Skill 与本地脚本**，不是 MCP 服务端，也不会自动创建 API Key、安装 MCP 或获取付费权限。站点服务是否可用以 DramaStudio 实际部署为准。

## 仓库结构

```text
dramastudio/
├── SKILL.md                  # Agent Skills 入口与安全操作流程
├── references/connection.md # MCP 工具、连接方式及客户端示例
└── scripts/mcp-client.mjs    # 无额外依赖的 Node.js 22+ 本地回退脚本
```

**请安装整个 `dramastudio/` 目录，而不只是 `SKILL.md`；仓库根目录不是 Skill 目录。**安装前先审查全部三个文件，按你的 Agent 宿主文档放入用户级 Skills 目录。纯聊天环境或不允许安装工具的宿主不能仅凭粘贴 Skill 获得执行能力。

## 接入步骤

1. 在 [DramaStudio API Key 页面](https://dramastudio.dexiao.ai/settings/api-keys) **自行登录并创建 Key**。默认从只读 `read` 开始；如需付费生成，再新建明确授予 `generate` 且设置合适每日预算的 Key。Key 只显示一次，现有 Key 的权限和预算不能直接修改。
2. 仅在宿主的**私密凭证设置或受保护的本地环境**录入 Key，不要放进对话、提示词、仓库文件、命令参数或共享配置。优先将宿主原生 MCP 客户端连接到 `https://dramastudio.dexiao.ai/api/mcp`，选择 Streamable HTTP，用私密凭证提供 `Authorization: Bearer` 请求头。也可以使用登录后 [接入指南](https://dramastudio.dexiao.ai/settings/api-keys/guide) 展示的当前站点 MCP 地址。
3. 如果宿主没有兼容的原生远程 MCP，但有可信的本地 Node.js 22+ Shell，可在用户**私密注入** `DRAMASTUDIO_API_KEY` 后运行 `node dramastudio/scripts/mcp-client.mjs list-tools`。需要连接非默认站点时，只在用户确认其所属域名后设置 `DRAMASTUDIO_MCP_URL`；脚本仍只请求该站点的 `/api/mcp`。
4. 用 `tools/list` 和一项**只读**工具（如 `list_creation_templates` / `list_projects`）验证。`generate`-only Key 可改用只读的 `list_generation_models` 验证。**不要**通过提交付费生成测试连接。

安装 Skill 不等于 MCP 已连接；没有私密输入机制或执行权限时，请停下并提示用户手动配置。只支持 OAuth、不能自定义 Bearer 请求头的宿主不能直接连接；本项目目前不提供 MCP OAuth 或单独的浏览器授权登录。

## 付费操作边界

- `read` 可查询本人数据及模板目录；模板发现**不会**创建画布节点或运行模板工作流，使用模板须在浏览器里继续。
- 提交图片/视频前先调用 `estimate_generation`，向用户展示模型、提示词、参数与预估积分，取得**该次提交的明确同意**；随后使用不高于批准额度的 `maxCredits` 和该次请求稳定的 `idempotencyKey`。`maxCredits` 不是人工确认。
- 新 Key 默认预算最高 5,000 credits/UTC 日；所有 Key 共用用户级 5,000 credits/日上限，并受账户余额、单 Key 预算及限速约束。持有 `generate` Key 的客户端在限额内可直接提交付费任务，服务端不会逐次弹窗确认。

具体工具与示例见 [`dramastudio/SKILL.md`](dramastudio/SKILL.md) 和 [`dramastudio/references/connection.md`](dramastudio/references/connection.md)。
