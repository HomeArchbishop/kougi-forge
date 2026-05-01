import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

import { config } from '../config.ts'
import { getLLM } from './llm.ts'
import { logLLMCall, logRetry, logWarn, trackTokens } from './logger.ts'
import { refreshStatusBar } from './status-bar.ts'

const dim = '\x1b[2m'
const reset = '\x1b[0m'

interface SpinnerHandle {
  stop: (durationMs: number, usage?: { input_tokens?: number; output_tokens?: number }) => void
  update: (inputTokens: number, outputTokens: number, preview: string) => void
}

function startSpinner (label: string): SpinnerHandle {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  let outTokens = 0
  let currentPreview = ''
  const startTime = Date.now()

  if (!process.stdout.isTTY) {
    return {
      stop: (durationMs, usage) => {
        const sec = (durationMs / 1000).toFixed(1)
        const tokens = usage ? ` · ${usage.input_tokens ?? 0} in · ${usage.output_tokens ?? 0} out` : ''
        process.stdout.write(`${dim}   ⎿  ✓ ${label}  ${sec}s${tokens}${reset}\n`)
      },
      update: () => {},
    }
  }

  const timer = setInterval(() => {
    const sec = ((Date.now() - startTime) / 1000).toFixed(1)
    const tokenStr = outTokens > 0 ? ` out:${outTokens}` : ' 请求中'
    const previewStr = currentPreview ? `  "${currentPreview}"` : ''
    const line = `   ⎿  ${frames[i++ % frames.length]} ${sec}s${tokenStr}${previewStr}`
    process.stdout.cursorTo(0)
    process.stdout.clearLine(1)
    process.stdout.write(line)
  }, 100)

  return {
    stop: (durationMs, usage) => {
      clearInterval(timer)
      process.stdout.cursorTo(0)
      process.stdout.clearLine(1)
      const sec = (durationMs / 1000).toFixed(1)
      const tokens = usage ? ` · ${usage.input_tokens ?? 0} in · ${usage.output_tokens ?? 0} out` : ''
      process.stdout.write(`${dim}   ⎿  ✓ ${label}  ${sec}s${tokens}${reset}\n`)
      refreshStatusBar()
    },
    update: (_inputTokens, outputTokens, preview) => {
      outTokens = outputTokens
      currentPreview = preview.replace(/[\r\n]+/g, ' ').slice(-10)
    },
  }
}

function isRetriable (error: unknown): boolean {
  if (!(error instanceof Error)) return true
  const msg = error.message.toLowerCase()
  // Rate limit, server errors, timeout, network issues
  if (/429|rate.?limit|too many requests/.test(msg)) return true
  if (/5\d{2}|server error|internal error|bad gateway|service unavailable/.test(msg)) return true
  if (/timeout|timed out|econnreset|econnrefused|socket hang up|fetch failed/.test(msg)) return true
  if (/network|dns|connection/.test(msg)) return true
  // Don't retry auth errors or invalid requests
  if (/401|403|invalid.?api.?key/.test(msg)) return false
  if (/400|invalid.?request/.test(msg)) return false
  return true
}

function getBackoffDelay (attempt: number): number {
  const base = config.llm.retryBaseDelayMs
  const delay = base * Math.pow(2, attempt - 1)
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.min(delay + jitter, 60_000) // cap at 60s
}

async function streamWithResume (
  messages: (SystemMessage | HumanMessage | AIMessage)[],
  onChunk: (text: string, usage: { input_tokens?: number; output_tokens?: number } | undefined) => void,
  context?: string,
): Promise<{ content: string; usage: { input_tokens?: number; output_tokens?: number } | undefined }> {
  const maxReconnects = config.llm.maxRetries
  let accumulated = ''
  let usage: { input_tokens?: number; output_tokens?: number } | undefined
  let reconnects = 0

  while (true) {
    const currentMessages = accumulated
      ? [...messages, new AIMessage(accumulated), new HumanMessage('请继续，从上文结尾处直接接续，不要重复已有内容。')]
      : messages

    try {
      const llm = getLLM()
      const stream = await llm.stream(currentMessages)
      let finished = false

      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : ''
        accumulated += text
        if (chunk.usage_metadata) {
          usage = chunk.usage_metadata
        }
        onChunk(text, usage)
        if (chunk.response_metadata?.finish_reason === 'stop') {
          finished = true
        }
      }

      if (finished) break

      // Stream ended without finish_reason=stop — treat as disconnect, reconnect
      if (reconnects >= maxReconnects) {
        break
      }
      reconnects++
      const delay = getBackoffDelay(reconnects)
      logRetry(reconnects, maxReconnects, '连接中断，续写重连', delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch (error: unknown) {
      if (!isRetriable(error) || reconnects >= maxReconnects) {
        const errMsg = error instanceof Error ? error.message : String(error)
        throw new Error(`LLM 调用失败${context ? ` (${context})` : ''}: ${errMsg}`)
      }
      reconnects++
      const delay = getBackoffDelay(reconnects)
      const errMsg = error instanceof Error ? error.message.slice(0, 100) : String(error).slice(0, 100)
      logRetry(reconnects, maxReconnects, errMsg, delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return { content: accumulated, usage }
}

export async function llmCall (systemPrompt: string, userMessage: string, context?: string): Promise<string> {
  const label = context ?? 'LLM调用'
  logLLMCall(label)
  const spinner = startSpinner(label)
  const start = Date.now()
  try {
    let outputTokens = 0
    let accumulated = ''
    const { content, usage } = await streamWithResume(
      [new SystemMessage(systemPrompt), new HumanMessage(userMessage)],
      (text, u) => {
        accumulated += text
        outputTokens = u?.output_tokens ?? Math.round(accumulated.length / 3)
        spinner.update(u?.input_tokens ?? 0, outputTokens, accumulated)
      },
      context,
    )
    trackTokens(usage?.input_tokens ?? 0, usage?.output_tokens ?? outputTokens)
    spinner.stop(Date.now() - start, usage)
    return content
  } catch (e) {
    spinner.stop(Date.now() - start)
    throw e
  }
}

export async function llmJsonCall<T> (systemPrompt: string, userMessage: string, context?: string): Promise<T> {
  const label = context ?? 'LLM JSON调用'
  logLLMCall(label)
  const spinner = startSpinner(label)
  const start = Date.now()
  try {
    let outputTokens = 0
    let accumulated = ''
    const { content: raw, usage } = await streamWithResume(
      [
        new SystemMessage(systemPrompt + '\n\n你必须以JSON格式返回结果，严格按照要求的结构输出。只输出JSON，不要包含任何其他文字或markdown代码块标记。'),
        new HumanMessage(userMessage),
      ],
      (text, u) => {
        accumulated += text
        outputTokens = u?.output_tokens ?? Math.round(accumulated.length / 3)
        spinner.update(u?.input_tokens ?? 0, outputTokens, accumulated)
      },
      context,
    )
    trackTokens(usage?.input_tokens ?? 0, usage?.output_tokens ?? outputTokens)
    spinner.stop(Date.now() - start, usage)
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    try {
      return JSON.parse(cleaned) as T
    } catch {
      logWarn('JSON 解析失败，尝试提取 JSON 部分...')
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T
      }
      throw new Error(`无法解析 LLM 返回的 JSON: ${cleaned.slice(0, 200)}`)
    }
  } catch (e) {
    spinner.stop(Date.now() - start)
    throw e
  }
}
