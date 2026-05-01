import { getDefaultCheckpointDir, loadUserConfig } from './utils/user-config.ts'

const user = loadUserConfig()

export const config = {
  llm: {
    provider: user.llm?.provider ?? 'openai',
    apiKey: user.llm?.apiKey ?? '',
    baseUrl: user.llm?.baseUrl ?? 'https://api.openai.com/v1',
    model: user.llm?.model ?? 'gpt-4o',
    maxRetries: user.llm?.maxRetries ?? 5,
    retryBaseDelayMs: user.llm?.retryBaseDelayMs ?? 2000,
    requestTimeoutMs: user.llm?.requestTimeoutMs ?? 600_000,
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
    dir: user.output?.dir ?? './output',
    format: 'markdown' as const,
  },
  persistence: {
    checkpointDir: user.persistence?.checkpointDir ?? getDefaultCheckpointDir(),
  },
  meta: {
    github: 'https://github.com/homearchbishop/kougi-forge',
    license: 'MIT',
  },
}
