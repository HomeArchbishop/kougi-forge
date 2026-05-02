import { config } from '../config.ts'
import { getTokenStats } from './logger.ts'
import { NODE_META, STAGE_LABELS } from './stage-config.ts'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

const NODE_STAGE: Record<string, number> = Object.fromEntries(
  Object.entries(NODE_META).map(([k, v]) => [k, v.stage]),
)

const STAGE_NAMES = Object.values(STAGE_LABELS)

// ─── state ────────────────────────────────────────────────────────────────────

let active = false
let currentStage = 0
let chapterIndex = 0
let totalChapters = 0
let bookTitle = ''
let startTime = 0
let timer: ReturnType<typeof setInterval> | null = null

// ─── helpers ──────────────────────────────────────────────────────────────────

function rows (): number { return process.stdout.rows ?? 24 }
function cols (): number { return process.stdout.columns ?? 80 }

function formatDuration (ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

function formatK (n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// ─── draw ─────────────────────────────────────────────────────────────────────

function draw (): void {
  if (!active || !process.stdout.isTTY) return

  const r = rows()
  const w = cols()
  const { inputTokens, outputTokens, calls } = getTokenStats()
  const elapsed = formatDuration(Date.now() - startTime)

  // Phase indicators
  const phases = STAGE_NAMES.map((name, i) => {
    const n = i + 1
    const label = (n === 4 && totalChapters > 0)
      ? `${name} ${Math.min(chapterIndex + 1, totalChapters)}/${totalChapters}`
      : name
    if (n < currentStage) return `${c.dim}${label} ✓${c.reset}`
    if (n === currentStage) return `${c.bold}${c.cyan}${label}${c.reset}`
    return `${c.dim}${label}${c.reset}`
  }).join(`${c.dim} › ${c.reset}`)

  // Stats
  const stats = calls > 0
    ? `${c.dim}${formatK(inputTokens)} in  ${formatK(outputTokens)} out  ${calls} calls  ${elapsed}${c.reset}`
    : `${c.dim}${elapsed}${c.reset}`

  // Separator line: embed app name + model (+ title if known) on the left
  const titleSuffix = bookTitle ? `  ${bookTitle}` : ''
  const brand = `${c.bold}kougi-forge${c.reset}${c.dim}  ${config.llm.model}${titleSuffix}${c.reset}`
  const brandRaw = `kougi-forge  ${config.llm.model}${titleSuffix}`
  const sepFill = Math.max(0, w - brandRaw.length - 2)
  const sep = `${c.dim} ${c.reset}${brand}${c.dim}  ${'─'.repeat(sepFill)}${c.reset}`

  const meta = `${c.dim} ${config.meta.license} · ${config.meta.github} · v${process.env.VERSION ?? 'dev'}${c.reset}`

  process.stdout.write('\x1b7')
  process.stdout.write(`\x1b[${r - 2};1H\x1b[2K${sep}`)
  process.stdout.write(`\x1b[${r - 1};1H\x1b[2K ${phases}    ${stats}`)
  process.stdout.write(`\x1b[${r};1H\x1b[2K${meta}`)
  process.stdout.write('\x1b8')
}

// ─── public API ───────────────────────────────────────────────────────────────

export function initStatusBar (): void {
  if (!process.stdout.isTTY) return
  active = true
  startTime = Date.now()
  const r = rows()
  // DECSTBM resets cursor to (1,1); immediately move to bottom of scroll region
  process.stdout.write(`\x1b[1;${r - 3}r\x1b[${r - 3};1H`)
  draw()
  timer = setInterval(draw, 1000)
  process.on('SIGWINCH', onResize)
}

export function destroyStatusBar (): void {
  if (!active) return
  active = false
  if (timer) { clearInterval(timer); timer = null }
  process.off('SIGWINCH', onResize)
  const r = rows()
  process.stdout.write('\x1b[r')
  process.stdout.write(`\x1b[${r - 2};1H\x1b[2K`)
  process.stdout.write(`\x1b[${r - 1};1H\x1b[2K`)
  process.stdout.write(`\x1b[${r};1H\x1b[2K`)
  process.stdout.write(`\x1b[${r - 2};1H`)
}

export function updateStageFromNode (nodeName: string): void {
  const stage = NODE_STAGE[nodeName]
  if (stage !== undefined && stage !== currentStage) {
    currentStage = stage
    draw()
  }
}

export function setStage (stage: number): void {
  if (stage > 0 && stage !== currentStage) {
    currentStage = stage
    draw()
  }
}

export function setBookTitle (title: string): void {
  bookTitle = title
  draw()
}

export function setChapterProgress (index: number, total: number): void {
  chapterIndex = index
  if (total > 0) totalChapters = total
  draw()
}

export function refreshStatusBar (): void {
  draw()
}

function onResize (): void {
  if (!active) return
  const r = rows()
  process.stdout.write(`\x1b[1;${r - 3}r\x1b[${r - 3};1H`)
  draw()
}
