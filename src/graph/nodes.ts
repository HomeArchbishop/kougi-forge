import type { NodeMeta } from '../utils/stage-config.ts'

export const NODES = {
  // Phase 1: Requirements
  parse_input: { stage: 1, message: '解析需求' },
  check_sufficiency: { stage: 1, message: '检查需求完整性' },
  generate_questions: { stage: 1, message: '生成澄清问题' },
  ask_clarification: { stage: 1, message: '等待用户澄清' },
  fill_defaults: { stage: 1, message: '填充默认' },
  generate_project_def: { stage: 1, message: '生成项目定义' },

  // Phase 2: Blueprint
  generate_blueprints: { stage: 2, message: '生成蓝图方案' },
  compare_and_merge: { stage: 2, message: '比较并融合蓝图' },
  critique_blueprint: { stage: 2, message: '评审蓝图质量' },
  revise_blueprint: { stage: 2, message: '修订蓝图' },
  confirm_blueprint: { stage: 2, message: '确认蓝图' },

  // Phase 3: Sample Chapter
  select_sample_chapter: { stage: 3, message: '选择样章' },
  sample_plan_chapter: { stage: 3, message: '规划样章' },
  sample_write_variants: { stage: 3, message: '撰写样章多版本' },
  sample_synthesize: { stage: 3, message: '综合样章' },
  confirm_sample: { stage: 3, message: '确认样章' },

  // Phase 4: Chapter Production
  select_next_chapter: { stage: 4, message: '选择章节' },
  ch_plan_chapter: { stage: 4, message: '规划章节' },
  ch_research: { stage: 4, message: '调研资料' },
  ch_write_variants: { stage: 4, message: '撰写多版本草稿' },
  ch_synthesize: { stage: 4, message: '综合草稿' },
  ch_review_all: { stage: 4, message: '多专家并行审校' },
  ch_plan_and_rewrite: { stage: 4, message: '修订章节' },
  ch_generate_exercises: { stage: 4, message: '生成练习题' },
  ch_review_exercises: { stage: 4, message: '审查练习题' },
  ch_finalize: { stage: 4, message: '章节定稿' },

  // Phase 5: Book Assembly
  assemble_book: { stage: 5, message: '组装全书' },
  consistency_check: { stage: 5, message: '一致性检查' },
  global_revision: { stage: 5, message: '全书修订' },
  format_output: { stage: 5, message: '输出文件' },
  final_confirmation: { stage: 5, message: '最终确认' },
} as const satisfies Record<string, NodeMeta>

export type NodeName = keyof typeof NODES
