import { config } from '../config.ts'
import { qualityGate } from '../nodes/chapter/quality-gate.ts'
import type { TextbookStateType } from '../types/index.ts'
import { NODES as N } from './nodes.ts'

const n = Object.fromEntries(Object.keys(N).map(k => [k, k])) as { [K in keyof typeof N]: K }

export function sufficiencyRouter (state: TextbookStateType): string {
  if (state.clarification?.isSufficient) return n.fill_defaults
  if (state.clarification?.round >= config.quality.maxClarificationRounds) return n.fill_defaults
  return n.generate_questions
}

export function blueprintCritiqueRouter (state: TextbookStateType): string {
  const critique = state.blueprintCritique
  if (!critique) return n.confirm_blueprint
  if (critique.score >= config.quality.blueprintPassScore || critique.passed) return n.confirm_blueprint
  if (state.workflow?.revisionRound >= config.quality.blueprintMaxRounds) return n.confirm_blueprint
  return n.revise_blueprint
}

export function blueprintConfirmRouter (state: TextbookStateType): string {
  if (state.blueprint?.confirmedByUser) return n.select_sample_chapter
  return n.revise_blueprint
}

export function sampleConfirmRouter (state: TextbookStateType): string {
  if (state.workflow.currentStage === 'chapter_production') return n.select_next_chapter
  return n.sample_write_variants
}

export function nextChapterRouter (state: TextbookStateType): string {
  return state.workflow.currentChapterId ? n.ch_plan_chapter : n.assemble_book
}

export function researchRouter (state: TextbookStateType): string {
  const chapterId = state.workflow.currentChapterId!
  const plan = state.chapterPlans[chapterId]
  if (!plan) return n.ch_write_variants
  const needsResearch = plan.sections.some(s =>
    s.keyPoints.some(kp => /数据|统计|法规|标准|最新|趋势|研究|文献/.test(kp)),
  )
  return needsResearch ? n.ch_research : n.ch_write_variants
}

export function chapterQualityRouter (state: TextbookStateType): string {
  const result = qualityGate(state)
  if (!result.passed) return n.ch_plan_and_rewrite
  return state.userInput.needsExercises === true ? n.ch_generate_exercises : n.ch_finalize
}

export function chapterLoopRouter (state: TextbookStateType): string {
  const totalChapters = state.blueprint.tableOfContents.length
  if (state.workflow.currentChapterIndex >= totalChapters) return n.assemble_book
  return n.select_next_chapter
}

export function globalRevisionRouter (state: TextbookStateType): string {
  const done = state.workflow.revisionChapterIndex >= state.finalBook.chapters.length
  return done ? n.format_output : n.global_revision
}
