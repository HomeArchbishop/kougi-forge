export const config = {
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'openai',
    apiKey: process.env.LLM_API_KEY ?? '',
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL ?? 'gpt-5.4',
    maxRetries: 5,
    retryBaseDelayMs: 2000,
    requestTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 600_000),
  },
  quality: {
    blueprintPassScore: 8.5,
    blueprintMaxRounds: 3,
    chapterPassScore: 8.5,
    chapterMaxRevisionRounds: 3,
    finalPassScore: 8.5,
    maxClarificationRounds: 2,
  },
  output: {
    dir: process.env.OUTPUT_DIR ?? './output',
    format: 'markdown' as const,
  },
  persistence: {
    checkpointDir: process.env.CHECKPOINT_DIR ?? './.checkpoints',
  },
  meta: {
    github: 'https://github.com/homearchbishop/kougi-forge',
    license: 'MIT',
  },
} as const
