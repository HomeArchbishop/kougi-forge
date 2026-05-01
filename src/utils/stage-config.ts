import { NODES } from '../graph/nodes.ts'
import type { WorkflowStage } from '../types/common.ts'

export interface NodeMeta {
  stage: number
  message?: string  // progress log text; absent for pure-routing nodes
}

export const STAGE_LABELS: Record<number, string> = {
  1: '需求分析',
  2: '蓝图规划',
  3: '样章生成',
  4: '章节生产',
  5: '全书组装',
}

// WorkflowStage string values
export const WORKFLOW_STAGE_MAP: Record<WorkflowStage, number> = {
  requirements: 1,
  blueprint: 2,
  sample_chapter: 3,
  chapter_production: 4,
  book_assembly: 5,
  done: 5,
}

export const NODE_META: Record<string, NodeMeta> = NODES
