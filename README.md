# kougi-forge - 教材生成 Agent

输入主题和要求，自动生成一本结构完整的教材。

基于 LangGraph.js 构建的多智能体流水线，通过需求分析、蓝图规划、多版本撰写、专家审校、练习题生成、全书一致性检查等阶段，逐步生成高质量教材。

## 功能

- 需求澄清：自动分析主题，不足时向用户追问
- 蓝图生成：多方案设计后合并，用户确认后进入撰写
- 逐章写作：并发生成多个风格变体，综合取优
- 专家审校：多角色并行评审，循环修订
- 练习题设计：每章自动生成练习与思考题
- 全书一致性检查：术语、难度、风格统一
- 断点续写：任意时刻中断，下次 resume 继续

## 环境要求

- [Bun](https://bun.sh) >= 1.0

## 安装

```bash
bun install
```

## 配置

复制 `.env.example` 为 `.env`，填入以下变量：

```env
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.example.com/openai   # 兼容 OpenAI 格式的接口
LLM_MODEL=your-model-name
LLM_TIMEOUT_MS=600000   # 可选，默认 600000（10 分钟）
OUTPUT_DIR=./output     # 可选，默认 ./output
```

## 使用

**交互式输入主题：**

```bash
bun run start
```

**直接传入主题：**

```bash
bun run start "Python 编程入门，面向零基础学生，需要练习题和项目实践"
```

**恢复上次中断的会话：**

```bash
bun run start --resume <thread-id>

# 或自动恢复最近一次
bun run start --resume
```

**查看所有可恢复的会话：**

```bash
bun run start --list
```

运行过程中按 `Ctrl+C` 可随时中断，进度自动保存。

## 输出

生成的教材保存在 `OUTPUT_DIR`（默认 `./output`），格式为 Markdown。

## 开发

```bash
bun run dev        # 热重载
bun run typecheck  # 类型检查
bun run lint       # Lint
```

## 技术栈

- [Bun](https://bun.sh) — 运行时
- [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) — 多智能体状态图
- [LangChain.js](https://js.langchain.com) — LLM 调用层（兼容 OpenAI 接口）
