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

const spinnerManager = {
  queue: [] as string[],
}

function startSpinner (label: string): SpinnerHandle {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  let outTokens = 0
  let currentPreview = ''
  const startTime = Date.now()

  const id = crypto.randomUUID()
  spinnerManager.queue.unshift(id)

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

  let isFirstPrint = true
  const isCurrentFirstLine = spinnerManager.queue.length === 1

  const timer = setInterval(() => {
    const sec = ((Date.now() - startTime) / 1000).toFixed(1)
    const tokenStr = outTokens > 0 ? ` out:${outTokens}` : ' 请求中'
    const previewStr = currentPreview ? `  "${currentPreview}"` : ''
    const line = `   ⎿  ${frames[i++ % frames.length]} ${sec}s${tokenStr}${previewStr}`
    const deltaY = spinnerManager.queue.findIndex(x => x === id)
    if (!isFirstPrint) {
      process.stdout.moveCursor(0, -deltaY)
    } else {
      if (!isCurrentFirstLine) {
        process.stdout.write('\n')
      }
      isFirstPrint = false
    }
    process.stdout.cursorTo(0)
    process.stdout.clearLine(1)
    process.stdout.write(line)
    process.stdout.moveCursor(0, deltaY)
  }, 100)

  return {
    stop: (durationMs, usage) => {
      clearInterval(timer)
      const deltaY = spinnerManager.queue.length - 1
      process.stdout.moveCursor(0, -deltaY)
      process.stdout.cursorTo(0)
      process.stdout.clearLine(1)
      const sec = (durationMs / 1000).toFixed(1)
      const tokens = usage ? ` · ${usage.input_tokens ?? 0} in · ${usage.output_tokens ?? 0} out` : ''
      process.stdout.write(`${dim}   ⎿  ✓ ${label}  ${sec}s${tokens}${reset}\n`)
      process.stdout.moveCursor(0, deltaY)
      refreshStatusBar()
      spinnerManager.queue.splice(spinnerManager.queue.findIndex(x => x === id), 1)
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

const JSON_REPAIR_SYSTEM = `你是 JSON 修复助手。输入是一段本应可被 JSON.parse 解析的文本，但可能含有：markdown 代码块、前后说明文字、截断、转义错误、尾随逗号、单引号代替双引号等。
你的任务：根据原文语义，输出**唯一一段**合法、完整的 JSON（对象或数组）。
硬性要求：只输出 JSON 本体，不要 markdown 围栏、不要解释、不要其它任何字符。`

function stripJsonFences (raw: string): string {
  return raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
}

function tryParseLlmJson<T> (raw: string): T | null {
  const cleaned = stripJsonFences(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!jsonMatch) return null
    try {
      return JSON.parse(jsonMatch[0]) as T
    } catch {
      return null
    }
  }
}

const MAX_JSON_REPAIR_ATTEMPTS = 2

async function repairJsonWithLlm (malformed: string, context?: string): Promise<string> {
  const cap = 80_000
  const body = malformed.length > cap ? `${malformed.slice(0, cap)}\n\n…(已截断，上文为模型原始输出开头)` : malformed
  const user = `以下文本无法被 JSON.parse。请修复为合法 JSON，仅输出 JSON：\n\n${body}`
  return llmCall(JSON_REPAIR_SYSTEM, user, context ? `${context}·JSON修复` : 'JSON修复')
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

    let payload = tryParseLlmJson<T>(raw)
    if (payload !== null) return payload

    logWarn('JSON 解析失败，尝试用 LLM 修复…')
    let toFix = raw
    for (let i = 0; i < MAX_JSON_REPAIR_ATTEMPTS; i++) {
      const repaired = await repairJsonWithLlm(toFix, context)
      payload = tryParseLlmJson<T>(repaired)
      if (payload !== null) return payload
      toFix = repaired
      if (i < MAX_JSON_REPAIR_ATTEMPTS - 1) {
        logWarn(`LLM JSON 修复第 ${i + 1} 次输出仍非法，将再次修复…`)
      }
    }
    throw new Error(`无法解析 LLM 返回的 JSON（已尝试 ${MAX_JSON_REPAIR_ATTEMPTS} 次修复）: ${stripJsonFences(raw).slice(0, 200)}`)
  } catch (e) {
    spinner.stop(Date.now() - start)
    throw e
  }
}
