import { getActiveProfile, getDefaultCheckpointDir, loadUserConfig } from './utils/user-config.ts'

const user = loadUserConfig()
const llm = getActiveProfile(user)

export const config = {
  llm: {
    provider: llm.provider ?? 'openai',
    apiKey: llm.apiKey ?? '',
    baseUrl: llm.baseUrl ?? 'https://api.openai.com/v1',
    model: llm.model ?? 'gpt-4o',
    maxRetries: llm.maxRetries ?? 5,
    retryBaseDelayMs: llm.retryBaseDelayMs ?? 2000,
    requestTimeoutMs: llm.requestTimeoutMs ?? 600_000,
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
