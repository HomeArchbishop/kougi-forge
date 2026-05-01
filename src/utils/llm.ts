import { ChatOpenAI } from '@langchain/openai'

import { config } from '../config.ts'

let instance: ChatOpenAI | null = null

export function getLLM (): ChatOpenAI {
  if (!instance) {
    instance = new ChatOpenAI({
      model: config.llm.model,
      apiKey: config.llm.apiKey,
      configuration: {
        baseURL: config.llm.baseUrl,
      },
      temperature: 0.7,
      timeout: config.llm.requestTimeoutMs,
      maxRetries: 0, // we handle retries ourselves for better UX
    })
  }
  return instance
}

export function getLLMStrict (): ChatOpenAI {
  return new ChatOpenAI({
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    configuration: {
      baseURL: config.llm.baseUrl,
    },
    temperature: 0.3,
    timeout: config.llm.requestTimeoutMs,
    maxRetries: 0,
  })
}
