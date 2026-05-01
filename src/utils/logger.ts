import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

import { config } from '../config.ts'
import { NODE_META } from './stage-config.ts'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  white: '\x1b[37m',
  brightWhite: '\x1b[97m',
}

interface TokenFile {
  inputTokens: number
  outputTokens: number
  calls: number
}

let tokenFilePath: string | null = null

const tokenCounter: TokenFile = {
  inputTokens: 0,
  outputTokens: 0,
  calls: 0,
}

export async function initTokenCounter (threadId: string): Promise<void> {
  tokenFilePath = `${config.persistence.checkpointDir}/${threadId}/tokens.json`
  if (existsSync(tokenFilePath)) {
    try {
      const saved = JSON.parse(await readFile(tokenFilePath, 'utf8')) as TokenFile
      tokenCounter.inputTokens = saved.inputTokens ?? 0
      tokenCounter.outputTokens = saved.outputTokens ?? 0
      tokenCounter.calls = saved.calls ?? 0
    } catch { /* start fresh if corrupt */ }
  }
}

let onTokensUpdated: (() => void) | null = null

export function setTokensUpdatedCallback (cb: () => void): void {
  onTokensUpdated = cb
}

export function trackTokens (input: number, output: number): void {
  tokenCounter.inputTokens += input
  tokenCounter.outputTokens += output
  tokenCounter.calls++
  if (tokenFilePath) {
    writeFile(tokenFilePath, JSON.stringify(tokenCounter)).catch(() => {})
  }
  onTokensUpdated?.()
}

export function getTokenStats (): { inputTokens: number; outputTokens: number; calls: number } {
  return { ...tokenCounter }
}

// ─── stage / progress ────────────────────────────────────────────────────────

export function logStage (label: string): void {
  console.log(`\n${c.bold}${label}${c.reset}`)
}

export function logProgress (message: string): void {
  console.log(`${c.dim}  ${message}${c.reset}`)
}

// ─── LLM call lifecycle ──────────────────────────────────────────────────────

export function logLLMCall (context: string): void {
  console.log(`${c.dim} ⏺ ${context}${c.reset}`)
}

// ─── interrupt (user confirmation) ───────────────────────────────────────────

export interface InterruptOption {
  label: string   // shown in selector
  value: string   // returned to graph on selection; if empty, prompts free text
}

export interface InterruptPayload {
  message: string
  options?: InterruptOption[]  // if absent → pure free-text prompt
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

function stripAnsi (str: string): string {
  return str.replace(ANSI_RE, '')
}

function visualWidth (str: string): number {
  return visualWidthRaw(stripAnsi(str))
}

function visualWidthRaw (str: string): number {
  let w = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0
    // CJK Unified Ideographs, CJK Extensions, Hangul, Fullwidth forms, etc.
    if (
      (cp >= 0x1100 && cp <= 0x115F) ||   // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x303E) ||   // CJK Radicals / Kangxi
      (cp >= 0x3041 && cp <= 0x33BF) ||   // Hiragana / Katakana / CJK Symbols
      (cp >= 0x3400 && cp <= 0x4DBF) ||   // CJK Extension A
      (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK Unified Ideographs
      (cp >= 0xA000 && cp <= 0xA4CF) ||   // Yi
      (cp >= 0xAC00 && cp <= 0xD7AF) ||   // Hangul Syllables
      (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compatibility Ideographs
      (cp >= 0xFE10 && cp <= 0xFE1F) ||   // Vertical Forms
      (cp >= 0xFE30 && cp <= 0xFE6F) ||   // CJK Compatibility Forms
      (cp >= 0xFF00 && cp <= 0xFF60) ||   // Fullwidth Latin / Halfwidth Katakana
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Fullwidth Signs
      (cp >= 0x20000 && cp <= 0x2A6DF) || // CJK Extension B
      (cp >= 0x2A700 && cp <= 0x2CEAF) || // CJK Extensions C/D/E
      (cp >= 0x2CEB0 && cp <= 0x2EBEF) || // CJK Extension F
      (cp >= 0x30000 && cp <= 0x3134F)    // CJK Extension G
    ) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

export function logInterrupt (payload: InterruptPayload): void {
  const cols = process.stdout.columns ?? 80
  const boxWidth = Math.min(cols, 80)
  const innerWidth = boxWidth - 4

  function wrapLine (line: string): string[] {
    if (visualWidth(line) <= innerWidth) return [line]
    const wrapped: string[] = []
    let current = ''
    let currentW = 0
    for (const ch of line) {
      const cw = visualWidth(ch)
      if (currentW + cw > innerWidth) {
        wrapped.push(current)
        current = ch
        currentW = cw
      } else {
        current += ch
        currentW += cw
      }
    }
    if (current) wrapped.push(current)
    return wrapped
  }

  const lines = payload.message.split('\n').flatMap(wrapLine)
  const bar = '─'.repeat(boxWidth - 2)
  console.log(`\n${c.dim}╭${bar}╮${c.reset}`)
  for (const line of lines) {
    const pad = ' '.repeat(Math.max(0, innerWidth - visualWidth(line)))
    console.log(`${c.dim}│${c.reset} ${line}${pad} ${c.dim}│${c.reset}`)
  }
  if (payload.options) {
    console.log(`${c.dim}│${' '.repeat(boxWidth - 2)}│${c.reset}`)
    for (let i = 0; i < payload.options.length; i++) {
      const opt = payload.options[i]!
      const label = `${i + 1}. ${opt.label}`
      const pad = ' '.repeat(Math.max(0, innerWidth - visualWidth(label)))
      console.log(`${c.dim}│${c.reset} ${label}${pad} ${c.dim}│${c.reset}`)
    }
  }
  console.log(`${c.dim}╰${bar}╯${c.reset}`)
}

// ─── structured data display ─────────────────────────────────────────────────

export function logProjectDef (p: {
  title: string
  subtitle: string
  positioning: string
  audienceProfile: string
  learningGoals: string[]
  prerequisites: string[]
  pedagogicalApproach: string
  estimatedChapters: number
  estimatedWordsPerChapter: number
  outputFormat: string
  styleGuide: string
}): void {
  const cols = process.stdout.columns ?? 80
  const w = Math.min(cols, 80)
  const bar = '─'.repeat(w - 2)
  const inner = w - 4  // space between │ and │

  // Wrap a single text value to fit within `avail` visual columns
  function wrapText (text: string, avail: number): string[] {
    if (visualWidth(text) <= avail) return [text]
    const result: string[] = []
    let cur = ''
    let curW = 0
    for (const ch of text) {
      const cw = visualWidth(ch)
      if (curW + cw > avail && cur) {
        result.push(cur)
        cur = ch
        curW = cw
      } else {
        cur += ch
        curW += cw
      }
    }
    if (cur) result.push(cur)
    return result
  }

  // Print a box row: │ <content padded to inner> │
  function boxLine (content: string, dim = false): void {
    const pad = ' '.repeat(Math.max(0, inner - visualWidth(content)))
    const text = dim ? `${c.dim}${content}${c.reset}` : content
    console.log(`${c.dim}│${c.reset} ${text}${pad} ${c.dim}│${c.reset}`)
  }

  function boxSep (): void {
    console.log(`${c.dim}├${'─'.repeat(w - 2)}┤${c.reset}`)
  }

  // Label-value row(s) inside the box
  function boxRow (label: string, value: string): void {
    const labelW = visualWidth(label)
    const gap = 2
    const valueAvail = inner - labelW - gap
    const valueLines = wrapText(value, valueAvail)
    const firstLine = `${c.dim}${label}${c.reset}${'  '}${valueLines[0] ?? ''}`
    boxLine(firstLine)
    const indent = ' '.repeat(labelW + gap)
    for (let i = 1; i < valueLines.length; i++) {
      boxLine(`${indent}${valueLines[i]}`)
    }
  }

  function boxList (label: string, items: string[]): void {
    if (!items.length) return
    boxLine(`${c.dim}${label}${c.reset}`, false)
    const bulletAvail = inner - 4
    for (const item of items) {
      const lines = wrapText(item, bulletAvail)
      boxLine(`  ${c.dim}·${c.reset} ${lines[0] ?? ''}`)
      for (let i = 1; i < lines.length; i++) {
        boxLine(`    ${lines[i]}`)
      }
    }
  }

  console.log(`\n${c.dim}╭${bar}╮${c.reset}`)
  boxLine(`${c.bold}${p.title}${c.reset}`)
  if (p.subtitle) boxLine(p.subtitle, true)
  boxSep()
  boxRow('定位', p.positioning)
  boxRow('读者', p.audienceProfile)
  boxRow('教学法', p.pedagogicalApproach)
  boxRow('风格', p.styleGuide)
  if (p.learningGoals.length || p.prerequisites.length) boxSep()
  boxList('学习目标', p.learningGoals)
  boxList('先修知识', p.prerequisites)
  boxSep()
  boxLine(`${c.dim}规模${c.reset}  ${p.estimatedChapters} 章 · 每章约 ${p.estimatedWordsPerChapter.toLocaleString()} 字 · ${p.outputFormat}`)
  console.log(`${c.dim}╰${bar}╯${c.reset}`)
}

// ─── status / errors ─────────────────────────────────────────────────────────

export function logError (message: string): void {
  console.error(`\n${c.red}✖ ${message}${c.reset}`)
}

export function logWarn (message: string): void {
  console.log(`${c.yellow}  ${message}${c.reset}`)
}

export function logRetry (attempt: number, maxRetries: number, error: string, delayMs: number): void {
  console.log(`${c.dim}  retry ${attempt}/${maxRetries} · ${(delayMs / 1000).toFixed(1)}s · ${error.slice(0, 80)}${c.reset}`)
}

export function logSaved (threadId: string): void {
  console.log(`${c.dim}  session saved · ${threadId}${c.reset}`)
}

export function logResume (threadId: string): void {
  console.log(`${c.dim}  resuming · ${threadId}${c.reset}`)
}

// ─── token summary ────────────────────────────────────────────────────────────

export function logTokenSummary (): void {
  const { inputTokens, outputTokens, calls } = tokenCounter
  const total = inputTokens + outputTokens
  console.log(`\n${c.dim}${calls} calls · ${inputTokens.toLocaleString()} in · ${outputTokens.toLocaleString()} out · ${total.toLocaleString()} total${c.reset}`)
}

// ─── session history ──────────────────────────────────────────────────────────

export function logSessionHistory (events: Array<{
  nodeName: string
  stage: number
  stageLabel: string
  title: string
  completedChapters: number
  totalChapters: number
}>): void {
  if (events.length === 0) return

  const title = events.at(-1)?.title ?? ''

  console.log(`\n${c.dim}历史记录 ${title}${c.reset}`)
  let lastStage = 0

  for (const ev of events) {
    if (ev.stage !== lastStage) {
      console.log(`  ${c.dim}── ${ev.stageLabel} ──${c.reset}`)
      lastStage = ev.stage
    }
    const meta = NODE_META[ev.nodeName]
    const label = meta?.message ?? ev.nodeName
    const extra = ev.totalChapters > 0 && ev.stage === 4
      ? `  ${c.dim}${ev.completedChapters + 1}/${ev.totalChapters}章${c.reset}`
      : ''
    console.log(`  ${c.dim}✓${c.reset} ${label}${extra}`)
  }
  console.log()
}
