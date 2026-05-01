import { mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'

import { Command } from '@langchain/langgraph'

import { config } from './config.ts'
import { compileMainGraph } from './graph/main.ts'
import type { UserInput } from './types/index.ts'
import { listThreads, loadLatestWorkflowStage, loadSessionHistory } from './utils/checkpointer.ts'
import { initTokenCounter, type InterruptPayload, logError, logInterrupt, logResume, logSaved, logSessionHistory, logStage, logTokenSummary, setTokensUpdatedCallback } from './utils/logger.ts'
import { destroyStatusBar, initStatusBar, refreshStatusBar, setBookTitle, setChapterProgress, setStage, updateStageFromNode } from './utils/status-bar.ts'

const dim = '\x1b[2m'
const cyan = '\x1b[36m'
const green = '\x1b[32m'
const bold = '\x1b[1m'
const reset = '\x1b[0m'

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
  console.log(`\n${dim}resume: bun run start --resume ${threadId}${reset}`)
}

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

async function resolveSession (args: string[]): Promise<{ threadId: string; initialInput: string | null }> {
  const resumeIdx = args.indexOf('--resume')
  if (resumeIdx !== -1) {
    let threadId = args[resumeIdx + 1] ?? ''
    if (!threadId) {
      const threads = await listThreads()
      if (threads.length === 0) {
        logError('no sessions to resume · use --list to check')
        process.exit(1)
      }
      threadId = threads[0]!.threadId
    }
    logResume(threadId)
    return { threadId, initialInput: null }
  }

  const threadId = `session-${Date.now()}`
  const nonFlagArgs = args.filter(a => !a.startsWith('--'))
  if (nonFlagArgs.length > 0) {
    return { threadId, initialInput: nonFlagArgs.join(' ') }
  }

  const initialInput = await promptUser('输入教材主题和要求')
  if (!initialInput) {
    process.exit(0)
  }
  return { threadId, initialInput }
}

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
  if (!payload.options || payload.options.length === 0) {
    return promptUser()
  }
  while (true) {
    const raw = await promptUser(`输入序号 1-${payload.options.length}`)
    const n = parseInt(raw, 10)
    if (n >= 1 && n <= payload.options.length) {
      const opt = payload.options[n - 1]!
      if (opt.value === '') {
        // free-text branch
        return promptUser(opt.label)
      }
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
    updateStageFromNode(nodeName)
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

async function main () {
  const args = process.argv.slice(2)

  if (args.includes('--list')) {
    await showSessions()
    return
  }

  mkdirSync(config.persistence.checkpointDir, { recursive: true })

  const { threadId, initialInput } = await resolveSession(args)

  if (initialInput) {
    logStage(initialInput)
  }

  mkdirSync(`${config.persistence.checkpointDir}/${threadId}`, { recursive: true })
  await initTokenCounter(threadId)
  setTokensUpdatedCallback(refreshStatusBar)
  initStatusBar()

  // On resume, infer current stage from checkpoint so status bar and log are correct immediately
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
  const threadConfig = { configurable: { thread_id: threadId } }
  const caffeinate = Bun.spawn(['caffeinate', '-i'], { stderr: 'ignore', stdout: 'ignore' })

  let currentInput: any = initialInput ? buildInitialInput(initialInput) : null

  let completed = false
  let shuttingDown = false

  process.on('SIGINT', () => {
    if (shuttingDown) {
      process.exit(1)
    }
    shuttingDown = true
    caffeinate.kill()
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

      if (!interruptPayload) {
        completed = true
        break
      }

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

  caffeinate.kill()
  destroyStatusBar()
  logTokenSummary()
  if (completed) {
    console.log(`\n${bold}done${reset}`)
  }
}

main()
  .catch(err => {
    logError(err.message ?? String(err))
    process.exit(1)
  })
