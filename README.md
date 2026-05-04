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

kougi-forge 将配置存储在用户级配置文件中：

- **macOS / Linux** — `~/.config/kougi-forge/config.json`
- **Windows** — `%APPDATA%\kougi-forge\config.json`

### LLM Profile

LLM 连接信息通过 **profile** 管理，可以保存多套配置并随时切换。

```bash
# 添加一个 profile
kougi-forge config profile add openai
kougi-forge config profile set openai apiKey  sk-...
kougi-forge config profile set openai model   gpt-4o
kougi-forge config profile set openai baseUrl https://api.openai.com/v1  # 可选

# 再添加一个（例如本地模型）
kougi-forge config profile add local
kougi-forge config profile set local apiKey  anything
kougi-forge config profile set local baseUrl http://localhost:11434/v1
kougi-forge config profile set local model   llama3.2

# 切换
kougi-forge config profile use local
kougi-forge config profile use openai

# 查看所有 profile
kougi-forge config profile list

# 查看某个 profile 的详情
kougi-forge config profile show openai
```

每个 profile 支持以下字段：

| 字段 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `apiKey` | API Key | ✓ | — |
| `model` | 模型名称 | ✓ | — |
| `provider` | 服务商名称 | | `openai` |
| `baseUrl` | API 地址 | | `https://api.openai.com/v1` |
| `maxRetries` | 失败后最大重试次数 | | `5` |
| `requestTimeoutMs` | 请求超时时间（毫秒） | | `600000` |

### 通用配置

```bash
kougi-forge config set output.dir ./my-output          # 设置输出目录
kougi-forge config set persistence.checkpointDir /path # 设置检查点目录
kougi-forge config list                                 # 查看当前所有配置
```

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `output.dir` | 生成文件的输出目录 | `./output` |
| `persistence.checkpointDir` | 会话检查点目录 | 平台默认¹ |

> ¹ macOS/Linux：`~/.cache/kougi-forge/checkpoints` · Windows：`%LOCALAPPDATA%\kougi-forge\checkpoints`

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
