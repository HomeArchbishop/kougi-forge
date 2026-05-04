import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// ─── types ────────────────────────────────────────────────────────────────────

export interface LLMProfile {
  provider?: string
  apiKey?: string
  baseUrl?: string
  model?: string
  maxRetries?: number
  retryBaseDelayMs?: number
  requestTimeoutMs?: number
}

export interface UserConfig {
  llm?: {
    activeProfile?: string
    profiles?: Record<string, LLMProfile>
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

// ─── key metadata ─────────────────────────────────────────────────────────────

export function getDefaultCheckpointDir (): string {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local')
    return join(localAppData, 'kougi-forge', 'checkpoints')
  }
  return join(homedir(), '.cache', 'kougi-forge', 'checkpoints')
}

// Non-LLM keys managed by `config set/get/rm`
export const KNOWN_KEYS: Record<string, KeyMeta> = {
  'output.dir': { description: 'Output directory', defaultValue: './output' },
  'persistence.checkpointDir': { description: 'Checkpoint directory', defaultValue: getDefaultCheckpointDir() },
}

// LLM keys managed by `config profile set/get`
export const PROFILE_KEYS: Record<string, KeyMeta> = {
  provider: { description: 'LLM provider (openai / anthropic / ...)', defaultValue: 'openai' },
  apiKey: { description: 'API key', required: true, secret: true },
  baseUrl: { description: 'API base URL', defaultValue: 'https://api.openai.com/v1' },
  model: { description: 'Model name', required: true },
  maxRetries: { description: 'Max retry attempts', defaultValue: '5' },
  requestTimeoutMs: { description: 'Request timeout (ms)', defaultValue: '600000' },
}

// ─── file I/O ─────────────────────────────────────────────────────────────────

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

// ─── non-LLM key access ───────────────────────────────────────────────────────

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

// ─── profile access ───────────────────────────────────────────────────────────

export function getActiveProfileName (cfg: UserConfig): string {
  return cfg.llm?.activeProfile ?? 'default'
}

export function getActiveProfile (cfg: UserConfig): LLMProfile {
  const name = getActiveProfileName(cfg)
  return cfg.llm?.profiles?.[name] ?? {}
}

export function listProfileEntries (cfg: UserConfig): Array<{ name: string; profile: LLMProfile; active: boolean }> {
  const activeName = getActiveProfileName(cfg)
  return Object.entries(cfg.llm?.profiles ?? {}).map(([name, profile]) => ({
    name,
    profile,
    active: name === activeName,
  }))
}

// ─── profile mutations ────────────────────────────────────────────────────────

export function addProfile (cfg: UserConfig, name: string): UserConfig {
  if (cfg.llm?.profiles?.[name]) throw new Error(`profile '${name}' already exists`)
  const profiles = { ...(cfg.llm?.profiles ?? {}), [name]: {} as LLMProfile }
  return {
    ...cfg,
    llm: {
      ...cfg.llm,
      activeProfile: cfg.llm?.activeProfile ?? name,
      profiles,
    },
  }
}

export function useProfile (cfg: UserConfig, name: string): UserConfig {
  if (!cfg.llm?.profiles?.[name]) throw new Error(`profile '${name}' does not exist`)
  return { ...cfg, llm: { ...cfg.llm, activeProfile: name } }
}

export function removeProfile (cfg: UserConfig, name: string): UserConfig {
  if (!cfg.llm?.profiles?.[name]) throw new Error(`profile '${name}' does not exist`)
  const profiles = { ...(cfg.llm.profiles ?? {}) }
  delete profiles[name]
  const remaining = Object.keys(profiles)
  const activeProfile = cfg.llm.activeProfile === name ? remaining[0] : cfg.llm.activeProfile
  return { ...cfg, llm: { ...cfg.llm, activeProfile, profiles } }
}

export function setProfileValue (cfg: UserConfig, name: string, key: string, value: string): UserConfig {
  if (!PROFILE_KEYS[key]) throw new Error(`unknown profile key '${key}'`)
  const profiles = { ...(cfg.llm?.profiles ?? {}) }
  profiles[name] = { ...profiles[name], [key]: coerceValue(value) }
  return { ...cfg, llm: { ...cfg.llm, profiles } }
}

export function getProfileValue (cfg: UserConfig, name: string, key: string): unknown {
  return (cfg.llm?.profiles?.[name] as Record<string, unknown> | undefined)?.[key]
}

export function rmProfileValue (cfg: UserConfig, name: string, key: string): UserConfig {
  if (!cfg.llm?.profiles?.[name]) throw new Error(`profile '${name}' does not exist`)
  const profile = { ...cfg.llm.profiles[name] } as Record<string, unknown>
  delete profile[key]
  const profiles = { ...cfg.llm.profiles, [name]: profile as LLMProfile }
  return { ...cfg, llm: { ...cfg.llm, profiles } }
}

// ─── validation ───────────────────────────────────────────────────────────────

export interface ConfigIssue {
  key: string
  description: string
}

export function validateConfig (cfg: UserConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const profiles = cfg.llm?.profiles ?? {}
  if (Object.keys(profiles).length === 0) {
    issues.push({ key: 'llm profile', description: 'no LLM profile configured' })
    return issues
  }
  const activeName = getActiveProfileName(cfg)
  const active = profiles[activeName]
  if (!active) {
    issues.push({ key: 'llm.activeProfile', description: `active profile '${activeName}' does not exist` })
    return issues
  }
  if (!active.apiKey) issues.push({ key: 'apiKey', description: `profile '${activeName}' is missing apiKey` })
  if (!active.model) issues.push({ key: 'model', description: `profile '${activeName}' is missing model` })
  return issues
}

// ─── internal ─────────────────────────────────────────────────────────────────

function coerceValue (value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  const n = Number(value)
  if (!isNaN(n) && value.trim() !== '') return n
  return value
}
