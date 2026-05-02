#!/usr/bin/env node
import { mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { Command } from '@langchain/langgraph'

import { config } from './config.ts'
import { autoYesResumeFromPayload, enableAutoYesEnv, isAutoYes } from './global-env.ts'
import { compileMainGraph } from './graph/main.ts'
import type { UserInput, WorkflowState } from './types/index.ts'
import { listThreads, loadLatestWorkflowStage, loadSessionHistory } from './utils/checkpointer.ts'
import { initTokenCounter, type InterruptPayload, logError, logInterrupt, logResume, logSaved, logSessionHistory, logStage, logTokenSummary, setTokensUpdatedCallback } from './utils/logger.ts'
import { destroyStatusBar, initStatusBar, refreshStatusBar, setBookTitle, setChapterProgress, setStage, updateStage } from './utils/status-bar.ts'
import { getConfigPath, getConfigValue, KNOWN_KEYS, loadUserConfig, rmConfigValue, saveUserConfig, setConfigValue, validateConfig } from './utils/user-config.ts'

const dim = '\x1b[2m'
const cyan = '\x1b[36m'
const green = '\x1b[32m'
const bold = '\x1b[1m'
const red = '\x1b[31m'
const reset = '\x1b[0m'

// ─── config subcommand ────────────────────────────────────────────────────────

function printConfigHelp (): void {
  const keys = Object.entries(KNOWN_KEYS)
  const keyWidth = Math.max(...keys.map(([k]) => k.length)) + 2
  console.log(`
${bold}kougi-forge config${reset}  manage configuration

${bold}USAGE${reset}
  kougi-forge config list
  kougi-forge config get <key>
  kougi-forge config set <key> <value>
  kougi-forge config rm  <key>

${bold}KEYS${reset}`)
  for (const [key, meta] of keys) {
    const req = meta.required ? ` ${red}required${reset}` : meta.defaultValue ? `${dim}  default: ${meta.defaultValue}${reset}` : ''
    console.log(`  ${cyan}${key.padEnd(keyWidth)}${reset}${dim}${meta.description}${reset}${req}`)
  }
  console.log(`\n${dim}config file: ${getConfigPath()}${reset}`)
}

function maskSecret (value: string): string {
  if (value.length <= 8) return '***'
  return value.slice(0, 4) + '***' + value.slice(-4)
}

function handleConfigList (): void {
  const cfg = loadUserConfig()
  const keys = Object.entries(KNOWN_KEYS)
  const keyWidth = Math.max(...keys.map(([k]) => k.length)) + 2
  const valWidth = 32
  console.log()
  for (const [key, meta] of keys) {
    const raw = getConfigValue(cfg, key)
    let valStr: string
    let suffix: string
    if (raw === undefined || raw === null || raw === '') {
      valStr = meta.required ? `${red}[not set]${reset}` : `${dim}[not set]${reset}`
      suffix = meta.required ? `  ${red}REQUIRED${reset}` : meta.defaultValue ? `${dim}  default: ${meta.defaultValue}${reset}` : ''
    } else {
      const display = meta.secret ? maskSecret(String(raw)) : String(raw)
      valStr = display
      suffix = meta.defaultValue && String(raw) === meta.defaultValue ? `${dim}  (default)${reset}` : ''
    }
    console.log(`  ${cyan}${key.padEnd(keyWidth)}${reset}${valStr.padEnd(valWidth)}${suffix}`)
  }
  console.log(`\n${dim}config file: ${getConfigPath()}${reset}`)
}

function handleConfigGet (key: string): void {
  if (!KNOWN_KEYS[key]) {
    console.error(`${red}unknown key: ${key}${reset}`)
    process.exit(1)
  }
  const cfg = loadUserConfig()
  const value = getConfigValue(cfg, key)
  if (value === undefined || value === null || value === '') {
    console.log(`${dim}[not set]${reset}`)
  } else {
    console.log(String(value))
  }
}

function handleConfigSet (key: string, value: string): void {
  if (!KNOWN_KEYS[key]) {
    console.error(`${red}unknown key: ${key}  (run: kougi-forge config list)${reset}`)
    process.exit(1)
  }
  const cfg = setConfigValue(loadUserConfig(), key, value)
  saveUserConfig(cfg)
  console.log(`${green}✓${reset} set ${cyan}${key}${reset}`)
}

function handleConfigRm (key: string): void {
  if (!KNOWN_KEYS[key]) {
    console.error(`${red}unknown key: ${key}  (run: kougi-forge config list)${reset}`)
    process.exit(1)
  }
  const cfg = rmConfigValue(loadUserConfig(), key)
  saveUserConfig(cfg)
  const meta = KNOWN_KEYS[key]!
  const hint = meta.defaultValue ? `${dim}  (reset to default: ${meta.defaultValue})${reset}` : ''
  console.log(`${green}✓${reset} removed ${cyan}${key}${reset}${hint}`)
}

function handleConfigCommand (args: string[]): void {
  const sub = args[0]
  if (!sub || sub === 'list') { handleConfigList(); return }
  if (sub === 'get') {
    if (!args[1]) { console.error(`${red}usage: kougi-forge config get <key>${reset}`); process.exit(1) }
    handleConfigGet(args[1])
    return
  }
  if (sub === 'set') {
    if (!args[1] || args[2] === undefined) { console.error(`${red}usage: kougi-forge config set <key> <value>${reset}`); process.exit(1) }
    handleConfigSet(args[1], args[2])
    return
  }
  if (sub === 'rm') {
    if (!args[1]) { console.error(`${red}usage: kougi-forge config rm <key>${reset}`); process.exit(1) }
    handleConfigRm(args[1])
    return
  }
  if (sub === '--help' || sub === '-h') { printConfigHelp(); return }
  console.error(`${red}unknown config subcommand: ${sub}${reset}`)
  printConfigHelp()
  process.exit(1)
}

// ─── config completeness check ────────────────────────────────────────────────

function assertConfigComplete (): void {
  const issues = validateConfig(loadUserConfig())
  if (issues.length === 0) return
  console.error(`\n${red}✖ missing required configuration:${reset}`)
  for (const issue of issues) {
    console.error(`  ${cyan}${issue.key}${reset}  ${dim}${issue.description}${reset}`)
    console.error(`  ${reset}${dim}run${reset}`)
    console.error(`    ${cyan}kougi-forge config set ${issue.key} <value>${reset}`)
    console.error(`  ${reset}${dim}to set ${issue.description}.${reset}`)
    console.error('\n')
  }
  process.exit(1)
}

// ─── prompts ──────────────────────────────────────────────────────────────────

async function promptUser (hint?: string): Promise<string> {
  const prompt = `\n${green} >${reset} ${hint ? `${dim}${hint}${reset} ` : ''}`
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function printResumeHint (threadId: string): void {
  console.log(`\n${dim}resume: kougi-forge --resume ${threadId}${reset}`)
}

function printHelp (): void {
  console.log(`
${bold}kougi-forge${reset}  AI textbook generator

${bold}USAGE${reset}
  kougi-forge [topic]              start a new session (prompts if no topic given)
  kougi-forge config <subcommand>  manage configuration
  kougi-forge --resume <id>        resume a session by id
  kougi-forge --list               list saved sessions
  kougi-forge --help               show this help

${bold}OPTIONS${reset}
  -r, --resume <session-id>        resume a session
  -l, --list                       list all sessions
  -y, --yes                        auto-confirm all interrupts (also env: autoYes=1)
  -h, --help                       show help

${bold}EXAMPLES${reset}
  kougi-forge config set llm.apiKey sk-...
  kougi-forge config list
  kougi-forge "数据结构与算法"
  kougi-forge --list
  kougi-forge --resume session-1234567890
`.trim())
}

// ─── sessions ─────────────────────────────────────────────────────────────────

async function showSessions (): Promise<void> {
  const threads = await listThreads()
  if (threads.length === 0) {
    console.log(`${dim}no sessions found${reset}`)
    return
  }
  console.log(`\n${bold}sessions${reset}`)
  console.log(dim + '─'.repeat(40) + reset)
  for (const t of threads) {
    console.log(`${cyan}${t.threadId}${reset}`)
    console.log(`${dim}  ${t.checkpoints.length} checkpoints · ${t.updatedAt}${reset}`)
  }
}

async function resolveSession (
  opts: { resume: boolean; sessionId?: string },
  positionals: string[],
): Promise<{ threadId: string; initialInput: string | null }> {
  if (opts.resume) {
    const threadId = opts.sessionId!
    logResume(threadId)
    return { threadId, initialInput: null }
  }

  const threadId = `session-${Date.now()}`
  if (positionals.length > 0) {
    return { threadId, initialInput: positionals.join(' ') }
  }

  const initialInput = await promptUser('输入教材主题和要求')
  if (!initialInput) process.exit(0)
  return { threadId, initialInput }
}

// ─── graph helpers ────────────────────────────────────────────────────────────

function buildInitialInput (initialInput: string): object {
  return {
    userInput: {
      rawInput: initialInput,
      topic: initialInput,
      targetAudience: null,
      level: null,
      purpose: null,
      style: null,
      length: null,
      format: null,
      language: '中文',
      needsExercises: null,
      needsCases: null,
      needsProjects: null,
      needsReferences: null,
      needsTeacherGuide: null,
      needsSlides: null,
      constraints: [],
    } satisfies UserInput,
  }
}

async function promptInterrupt (payload: InterruptPayload): Promise<string> {
  if (isAutoYes()) return autoYesResumeFromPayload(payload)
  if (!payload.options || payload.options.length === 0) {
    return promptUser()
  }
  while (true) {
    const raw = await promptUser(`输入序号 1-${payload.options.length}`)
    const n = parseInt(raw, 10)
    if (n >= 1 && n <= payload.options.length) {
      const opt = payload.options[n - 1]!
      if (opt.value === '') return promptUser(opt.label)
      return opt.value
    }
    console.log(`${'\x1b[2m'}  请输入 1 到 ${payload.options.length} 之间的数字${'\x1b[0m'}`)
  }
}

async function processEvent (event: Record<string, unknown>): Promise<InterruptPayload | null> {
  let payload: InterruptPayload | null = null
  for (const [nodeName, update] of Object.entries(event)) {
    if (nodeName === '__interrupt__') {
      const interrupts = update as Array<{ value: unknown }>
      for (const intr of interrupts) {
        const v = intr.value
        payload = (typeof v === 'object' && v !== null && 'message' in v)
          ? v as InterruptPayload
          : { message: String(v) }
        logInterrupt(payload)
      }
      continue
    }
    const workflow = (update as { workflow?: WorkflowState })?.workflow
    updateStage(workflow?.currentStage)
    const u = update as Record<string, any> | null
    const toc = u?.blueprint?.tableOfContents
    const wf = u?.workflow
    if (toc?.length > 0 || wf?.currentChapterIndex !== undefined) {
      setChapterProgress(wf?.currentChapterIndex ?? 0, toc?.length ?? 0)
    }
    const title: string | undefined = u?.textbookProject?.title
    if (title) setBookTitle(title)
  }
  return payload
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main () {
  const rawArgs = process.argv.slice(2)

  if (rawArgs[0] === 'config') {
    handleConfigCommand(rawArgs.slice(1))
    return
  }

  const { values, positionals } = parseArgs({
    args: rawArgs,
    options: {
      list: { type: 'boolean', short: 'l', default: false },
      resume: { type: 'string', short: 'r' },
      help: { type: 'boolean', short: 'h', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
    },
    allowPositionals: true,
  })

  if (values.help) { printHelp(); return }
  if (values.list) { await showSessions(); return }

  if (values.yes) enableAutoYesEnv()

  assertConfigComplete()

  mkdirSync(config.persistence.checkpointDir, { recursive: true })

  const { threadId, initialInput } = await resolveSession(
    { resume: !!values.resume, sessionId: values.resume },
    positionals,
  )

  if (initialInput) logStage(initialInput)

  mkdirSync(`${config.persistence.checkpointDir}/${threadId}`, { recursive: true })
  await initTokenCounter(threadId)
  setTokensUpdatedCallback(refreshStatusBar)
  initStatusBar()

  if (!initialInput) {
    const [rs, history] = await Promise.all([
      loadLatestWorkflowStage(threadId),
      loadSessionHistory(threadId),
    ])
    setStage(rs.stage)
    if (rs.totalChapters > 0) setChapterProgress(rs.chapterIndex, rs.totalChapters)
    if (rs.title) setBookTitle(rs.title)
    logSessionHistory(history)
  }

  const graph = compileMainGraph()
  const threadConfig = {
    configurable: { thread_id: threadId },
    recursionLimit: 999,
  }

  let currentInput: any = initialInput ? buildInitialInput(initialInput) : null
  let completed = false
  let shuttingDown = false

  process.on('SIGINT', () => {
    if (shuttingDown) process.exit(1)
    shuttingDown = true
    destroyStatusBar()
    console.log()
    logTokenSummary()
    logSaved(threadId)
    printResumeHint(threadId)
    process.exit(0)
  })

  while (true) {
    try {
      const stream = await graph.stream(currentInput, { ...threadConfig, streamMode: 'updates' })
      let interruptPayload: InterruptPayload | null = null

      for await (const event of stream) {
        const p = await processEvent(event as Record<string, unknown>)
        if (p) interruptPayload = p
      }

      if (!interruptPayload) { completed = true; break }

      logSaved(threadId)
      const userResponse = await promptInterrupt(interruptPayload)
      currentInput = new Command({ resume: userResponse })
    } catch (error: unknown) {
      logError(error instanceof Error ? error.message : String(error))
      if (error instanceof Error && error.stack) console.error(dim + error.stack + reset)
      logSaved(threadId)
      printResumeHint(threadId)
      break
    }
  }

  destroyStatusBar()
  logTokenSummary()
  if (completed) console.log(`\n${bold}done${reset}`)
}

main()
  .catch(err => {
    logError(err.message ?? String(err))
    process.exit(1)
  })
