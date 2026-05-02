import type { InterruptPayload } from './utils/logger.ts'

function envTruthy (v: string | undefined): boolean {
  if (v === undefined || v === '') return false
  const t = v.trim().toLowerCase()
  return t === '1' || t === 'true' || t === 'yes' || t === 'y'
}

/** CLI `-y` / `--yes` sets `process.env.autoYes`; you may also set `autoYes=1` or `AUTO_YES=1`. */
export function isAutoYes (): boolean {
  return envTruthy(process.env.autoYes) || envTruthy(process.env.AUTO_YES)
}

export function enableAutoYesEnv (): void {
  process.env.autoYes = '1'
}

/** Default resume value when auto-yes runs from the CLI loop (safety net). */
export function autoYesResumeFromPayload (payload: InterruptPayload): string {
  const opts = payload.options ?? []
  for (const v of ['完成', '确认', '跳过']) {
    if (opts.some(o => o.value === v)) return v
  }
  const first = opts.find(o => o.value !== '')
  return first?.value ?? ''
}
