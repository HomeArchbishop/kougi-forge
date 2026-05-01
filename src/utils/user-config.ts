import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface UserConfig {
  llm?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
    model?: string
    maxRetries?: number
    retryBaseDelayMs?: number
    requestTimeoutMs?: number
  }
  output?: {
    dir?: string
  }
  persistence?: {
    checkpointDir?: string
  }
}

export interface KeyMeta {
  description: string
  required?: true
  secret?: true
  defaultValue?: string
}

export function getDefaultCheckpointDir (): string {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local')
    return join(localAppData, 'kougi-forge', 'checkpoints')
  }
  return join(homedir(), '.cache', 'kougi-forge', 'checkpoints')
}

export const KNOWN_KEYS: Record<string, KeyMeta> = {
  'llm.provider': { description: 'LLM provider (openai / anthropic / ...)', defaultValue: 'openai' },
  'llm.apiKey': { description: 'API key', required: true, secret: true },
  'llm.baseUrl': { description: 'API base URL', defaultValue: 'https://api.openai.com' },
  'llm.model': { description: 'Model name', required: true },
  'llm.maxRetries': { description: 'Max retry attempts', defaultValue: '5' },
  'llm.requestTimeoutMs': { description: 'Request timeout (ms)', defaultValue: '600000' },
  'output.dir': { description: 'Output directory', defaultValue: './output' },
  'persistence.checkpointDir': { description: 'Checkpoint directory', defaultValue: getDefaultCheckpointDir() },
}

export function getConfigPath (): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'kougi-forge', 'config.json')
  }
  return join(homedir(), '.config', 'kougi-forge', 'config.json')
}

export function loadUserConfig (): UserConfig {
  const path = getConfigPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as UserConfig
  } catch {
    return {}
  }
}

export function saveUserConfig (cfg: UserConfig): void {
  const path = getConfigPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n')
}

export function getConfigValue (cfg: UserConfig, key: string): unknown {
  const parts = key.split('.')
  let obj: unknown = cfg
  for (const part of parts) {
    if (typeof obj !== 'object' || obj === null) return undefined
    obj = (obj as Record<string, unknown>)[part]
  }
  return obj
}

export function setConfigValue (cfg: UserConfig, key: string, value: string): UserConfig {
  const parts = key.split('.')
  const result = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>
  let obj = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (typeof obj[part] !== 'object' || obj[part] === null) obj[part] = {}
    obj = obj[part] as Record<string, unknown>
  }
  obj[parts[parts.length - 1]!] = coerceValue(value)
  return result as UserConfig
}

export function rmConfigValue (cfg: UserConfig, key: string): UserConfig {
  const parts = key.split('.')
  const result = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>
  let obj = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (typeof obj[part] !== 'object' || obj[part] === null) return result as UserConfig
    obj = obj[part] as Record<string, unknown>
  }
  delete obj[parts[parts.length - 1]!]
  return result as UserConfig
}

function coerceValue (value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  const n = Number(value)
  if (!isNaN(n) && value.trim() !== '') return n
  return value
}

export interface ConfigIssue {
  key: string
  description: string
}

export function validateConfig (cfg: UserConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  for (const [key, meta] of Object.entries(KNOWN_KEYS)) {
    if (meta.required && !getConfigValue(cfg, key)) {
      issues.push({ key, description: meta.description })
    }
  }
  return issues
}
