import { revisionPlannerPrompt } from '../../prompts/revision-planner.ts'
import type { ChapterDraft, TextbookStateType, WorkflowState } from '../../types/index.ts'
import { llmCall, llmJsonCall } from '../../utils/structured-output.ts'

export async function planAndRewrite (state: TextbookStateType): Promise<{ drafts: Record<string, ChapterDraft>; workflow: WorkflowState }> {
  const chapterId = state.workflow.currentChapterId!
  const draft = state.drafts[chapterId]!
  const reviews = state.reviews[chapterId]!

  const reviewSummary = JSON.stringify({
    subject: reviews.subjectReview,
    pedagogy: reviews.pedagogyReview,
    style: reviews.styleReview,
    factCheck: reviews.factCheckReview,
  }, null, 2)

  const revisionPlan = await llmJsonCall<{ revisions: { location: string; type: string; description: string }[]; overallDirection: string }>(
    revisionPlannerPrompt,
    `章节内容概要（前500字）：\n${draft.content.slice(0, 500)}...\n\n审校结果：\n${reviewSummary}`,
    `修订计划(${chapterId})`,
  )

  const rewriteResult = await llmCall(
    `你是教材修订作者。请根据修订计划修改以下章节。

修订要求：
- 只修改需要修改的部分
- 保持整体结构和章节目标不变
- 确保修改后内容连贯
- 直接输出完整的修改后 Markdown 章节`,
    `修订计划：\n${JSON.stringify(revisionPlan, null, 2)}\n\n原章节：\n${draft.content}`,
    `修订章节(${chapterId})`,
  )

  return {
    drafts: {
      [chapterId]: {
        ...draft,
        version: draft.version + 1,
        content: rewriteResult,
        status: 'revised',
        wordCount: rewriteResult.length,
      },
    },
    workflow: {
      ...state.workflow,
      revisionRound: state.workflow.revisionRound + 1,
    },
  }
}
