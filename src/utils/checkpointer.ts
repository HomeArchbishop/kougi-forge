import { readdirSync, unlinkSync } from 'node:fs'

import type { RunnableConfig } from '@langchain/core/runnables'
import type { BaseCheckpointSaver, Checkpoint, CheckpointListOptions, CheckpointMetadata, CheckpointPendingWrite, CheckpointTuple, PendingWrite, SerializerProtocol } from '@langchain/langgraph-checkpoint'

import { config } from '../config.ts'
import type { Blueprint, TextbookProject, UserInput, WorkflowState } from '../types/common.ts'
import { NODE_META, STAGE_LABELS, WORKFLOW_STAGE_MAP } from './stage-config.ts'

type ChannelVersions = Record<string, number | string>

// The subset of TextbookState channel values we care about for persistence queries.
// All fields are optional because a checkpoint may be taken before they are populated.
interface ChannelValues {
  userInput?: UserInput
  textbookProject?: TextbookProject
  blueprint?: Blueprint
  workflow?: WorkflowState
}

interface StoredCheckpoint {
  config: RunnableConfig
  checkpoint: Checkpoint & { channel_values: ChannelValues }
  metadata: CheckpointMetadata
  parentConfig?: RunnableConfig
  pendingWrites: CheckpointPendingWrite[]
}

export interface ThreadIndex {
  threadId: string
  checkpoints: string[]
  createdAt: string
  updatedAt: string
}

function getThreadDir (threadId: string): string {
  return `${config.persistence.checkpointDir}/${threadId}`
}

function getCheckpointPath (threadId: string, checkpointId: string): string {
  return `${getThreadDir(threadId)}/${checkpointId}.json`
}

function getIndexPath (threadId: string): string {
  return `${getThreadDir(threadId)}/index.json`
}

async function readJson<T> (path: string): Promise<T | null> {
  const file = Bun.file(path)
  if (!(await file.exists())) return null
  try {
    return await file.json() as T
  } catch {
    return null
  }
}

async function writeJson (path: string, data: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(data))
}

const jsonSerde: SerializerProtocol = {
  async dumpsTyped (data: unknown): Promise<[string, Uint8Array]> {
    const json = JSON.stringify(data)
    return ['json', new TextEncoder().encode(json)]
  },
  async loadsTyped (_type: string, data: Uint8Array | string): Promise<unknown> {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data)
    return JSON.parse(str)
  },
}

export class FileCheckpointSaver implements BaseCheckpointSaver {
  serde: SerializerProtocol = jsonSerde

  async get (config: RunnableConfig): Promise<Checkpoint | undefined> {
    const tuple = await this.getTuple(config)
    return tuple?.checkpoint
  }

  async getTuple (runnableConfig: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = runnableConfig.configurable?.thread_id as string | undefined
    if (!threadId) return undefined

    const checkpointId = runnableConfig.configurable?.checkpoint_id as string | undefined

    if (checkpointId) {
      const stored = await readJson<StoredCheckpoint>(getCheckpointPath(threadId, checkpointId))
      if (!stored) return undefined
      return {
        config: stored.config,
        checkpoint: stored.checkpoint,
        metadata: stored.metadata,
        parentConfig: stored.parentConfig,
        pendingWrites: stored.pendingWrites,
      }
    }

    const index = await readJson<ThreadIndex>(getIndexPath(threadId))
    if (!index || index.checkpoints.length === 0) return undefined

    const latestId = index.checkpoints[index.checkpoints.length - 1]!
    const stored = await readJson<StoredCheckpoint>(getCheckpointPath(threadId, latestId))
    if (!stored) return undefined

    return {
      config: stored.config,
      checkpoint: stored.checkpoint,
      metadata: stored.metadata,
      parentConfig: stored.parentConfig,
      pendingWrites: stored.pendingWrites,
    }
  }

  async * list (runnableConfig: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const threadId = runnableConfig.configurable?.thread_id as string | undefined
    if (!threadId) return

    const index = await readJson<ThreadIndex>(getIndexPath(threadId))
    if (!index) return

    const ids = [...index.checkpoints].reverse()
    const limit = options?.limit ?? ids.length

    for (let i = 0; i < Math.min(limit, ids.length); i++) {
      const stored = await readJson<StoredCheckpoint>(getCheckpointPath(threadId, ids[i]!))
      if (stored) {
        yield {
          config: stored.config,
          checkpoint: stored.checkpoint,
          metadata: stored.metadata,
          parentConfig: stored.parentConfig,
          pendingWrites: stored.pendingWrites,
        }
      }
    }
  }

  async put (runnableConfig: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, _newVersions: ChannelVersions): Promise<RunnableConfig> {
    const threadId = runnableConfig.configurable?.thread_id as string ?? 'default'
    const checkpointId = checkpoint.id

    const storedConfig: RunnableConfig = {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId,
      },
    }

    const stored: StoredCheckpoint = {
      config: storedConfig,
      checkpoint: checkpoint as StoredCheckpoint['checkpoint'],
      metadata,
      parentConfig: runnableConfig.configurable?.checkpoint_id
        ? { configurable: { thread_id: threadId, checkpoint_id: runnableConfig.configurable.checkpoint_id } }
        : undefined,
      pendingWrites: [],
    }

    await writeJson(getCheckpointPath(threadId, checkpointId), stored)

    const index = await readJson<ThreadIndex>(getIndexPath(threadId)) ?? {
      threadId,
      checkpoints: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (!index.checkpoints.includes(checkpointId)) {
      index.checkpoints.push(checkpointId)
    }
    index.updatedAt = new Date().toISOString()
    await writeJson(getIndexPath(threadId), index)

    return storedConfig
  }

  async putWrites (runnableConfig: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = runnableConfig.configurable?.thread_id as string | undefined
    const checkpointId = runnableConfig.configurable?.checkpoint_id as string | undefined
    if (!threadId || !checkpointId) return

    const path = getCheckpointPath(threadId, checkpointId)
    const stored = await readJson<StoredCheckpoint>(path)
    if (!stored) return

    for (const write of writes) {
      const channel = write[0]
      const idx = stored.pendingWrites.findIndex(w => w[0] === taskId && w[1] === channel)
      const entry = [taskId, channel, write[1]] as CheckpointPendingWrite
      if (idx !== -1) {
        stored.pendingWrites[idx] = entry
      } else {
        stored.pendingWrites.push(entry)
      }
    }
    await writeJson(path, stored)
  }

  async deleteThread (threadId: string): Promise<void> {
    const dir = getThreadDir(threadId)
    const file = Bun.file(`${dir}/index.json`)
    if (await file.exists()) {
      const index = await readJson<ThreadIndex>(getIndexPath(threadId))
      if (index) {
        for (const id of index.checkpoints) {
          try {
            unlinkSync(getCheckpointPath(threadId, id))
          } catch { /* ignore */ }
        }
      }
      try {
        unlinkSync(getIndexPath(threadId))
      } catch { /* ignore */ }
    }
  }

  getNextVersion (current: number | undefined): number {
    return (current ?? 0) + 1
  }
}

export async function listThreads (): Promise<ThreadIndex[]> {
  const dir = config.persistence.checkpointDir
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    const threads: ThreadIndex[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const index = await readJson<ThreadIndex>(getIndexPath(entry.name))
        if (index) threads.push(index)
      }
    }
    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

interface ResumeState {
  stage: number
  chapterIndex: number
  totalChapters: number
  title: string
}

export async function loadLatestWorkflowStage (threadId: string): Promise<ResumeState> {
  const fallback: ResumeState = { stage: 0, chapterIndex: 0, totalChapters: 0, title: '' }

  const index = await readJson<ThreadIndex>(getIndexPath(threadId))
  if (!index || index.checkpoints.length === 0) return fallback

  const latestId = index.checkpoints[index.checkpoints.length - 1]!
  const stored = await readJson<StoredCheckpoint>(getCheckpointPath(threadId, latestId))
  const cv = stored?.checkpoint.channel_values
  const wf = cv?.workflow
  const toc = cv?.blueprint?.tableOfContents ?? []
  const completedChapters = wf?.completedChapters ?? []

  const stage = wf?.currentStage
    ? WORKFLOW_STAGE_MAP[wf.currentStage]
    : 0

  return {
    stage,
    chapterIndex: completedChapters.length,
    totalChapters: toc.length,
    title: cv?.textbookProject?.title ?? '',
  }
}

export interface HistoryEvent {
  nodeName: string
  stage: number
  stageLabel: string
  title: string
  completedChapters: number
  totalChapters: number
}

export async function loadSessionHistory (threadId: string): Promise<HistoryEvent[]> {
  const index = await readJson<ThreadIndex>(getIndexPath(threadId))
  if (!index || index.checkpoints.length === 0) return []

  const events: HistoryEvent[] = []
  const seen = new Set<string>()

  // checkpoint[N].branch:to:X means X ran and produced checkpoint[N+1]
  // so we pair: pendingNodeName from checkpoint[N], state from checkpoint[N+1]
  let pendingNodeName: string | undefined

  for (const cid of index.checkpoints) {
    const stored = await readJson<StoredCheckpoint>(getCheckpointPath(threadId, cid))
    if (!stored) continue

    if (pendingNodeName && !seen.has(pendingNodeName)) {
      seen.add(pendingNodeName)
      const meta = NODE_META[pendingNodeName]
      if (meta) {
        const cv = stored.checkpoint.channel_values
        const toc = cv?.blueprint?.tableOfContents ?? []
        const completedChapters = cv?.workflow?.completedChapters ?? []
        events.push({
          nodeName: pendingNodeName,
          stage: meta.stage,
          stageLabel: STAGE_LABELS[meta.stage] ?? '',
          title: cv?.textbookProject?.title ?? '',
          completedChapters: completedChapters.length,
          totalChapters: toc.length,
        })
      }
    }

    const channelKeys = Object.keys(stored.checkpoint.channel_values)
    const branchKey = channelKeys.find(k => k.startsWith('branch:to:'))
    pendingNodeName = branchKey?.replace('branch:to:', '')
  }

  return events
}
