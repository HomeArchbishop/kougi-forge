# kougi-forge

AI 驱动的教材生成工具。输入主题和要求，kougi-forge 通过多智能体流水线自动生成结构完整的教材，涵盖需求分析、蓝图规划、多版本撰写、专家审校、练习题生成、全书一致性检查等阶段。

## 安装

```bash
# npm
npm install -g kougi-forge

# yarn
yarn global add kougi-forge

# pnpm
pnpm add -g kougi-forge

# bun
bun add -g kougi-forge
```

## 配置

首次使用前，设置必填项：

```bash
kougi-forge config set llm.apiKey   <你的 API Key>
kougi-forge config set llm.model    <模型名称>
```

查看所有配置项及当前值：

```bash
kougi-forge config list
```

### 配置项说明

| 配置项 | 说明 | 必填 | 默认值 |
|--------|------|------|--------|
| `llm.apiKey` | LLM 服务商 API Key | ✓ | — |
| `llm.model` | 模型名称（如 `gpt-4o`） | ✓ | — |
| `llm.provider` | 服务商名称 | | `openai` |
| `llm.baseUrl` | API 地址 | | `https://api.openai.com/v1` |
| `llm.maxRetries` | 失败后最大重试次数 | | `5` |
| `llm.requestTimeoutMs` | 请求超时时间（毫秒） | | `600000` |
| `output.dir` | 生成文件的输出目录 | | `./output` |
| `persistence.checkpointDir` | 会话检查点目录 | | 平台默认¹ |

> ¹ macOS/Linux：`~/.cache/kougi-forge/checkpoints` · Windows：`%LOCALAPPDATA%\kougi-forge\checkpoints`

### 配置管理命令

```bash
kougi-forge config list                     # 查看所有配置项和当前值
kougi-forge config get llm.model            # 查看单个配置项
kougi-forge config set llm.baseUrl <url>    # 设置配置项
kougi-forge config rm  llm.baseUrl          # 删除配置项（恢复默认值）
kougi-forge config --help                   # 查看帮助
```

## 使用

**交互式输入主题：**

```bash
kougi-forge
```

**直接传入主题和要求：**

```bash
kougi-forge "Python 编程入门，面向零基础学生，需要练习题和项目实践，包括教学幻灯片大纲，按32课时设计"
```

**恢复上次中断的会话：**

```bash
kougi-forge --resume session-1234567890
```

**查看所有已保存的会话：**

```bash
kougi-forge --list
```

运行过程中按 `Ctrl+C` 可随时中断，进度自动保存，下次可通过 `--resume` 继续。

## 输出

生成的文件写入 `output.dir`（默认 `./output`），格式为 Markdown：

```
./output/
  chapters/
    ch-01-introduction.md
    ch-02-...
  glossary.md
  exercises.md
  ...
```

## 流水线概览

```
需求分析  →  蓝图规划  →  样章确认  →  逐章生产  →  全书组装与一致性检查
```

每个阶段结束后自动保存检查点，中断后可从上次完成的阶段继续。

## 开发

依赖 [Bun](https://bun.sh)。

```bash
git clone https://github.com/homearchbishop/kougi-forge
cd kougi-forge
bun install          # 同时激活 git hooks
bun run dev          # 热重载运行
bun run typecheck    # 类型检查
bun run lint         # 代码检查
bun run build        # 编译至 dist/kougi-forge.js
```

## 技术栈

- [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) — 多智能体状态图
- [LangChain.js](https://js.langchain.com) — LLM 调用层（兼容 OpenAI 接口）
- [Bun](https://bun.sh) — 构建工具链

## 许可证

MIT © [homearchbishop](https://github.com/homearchbishop/kougi-forge)
