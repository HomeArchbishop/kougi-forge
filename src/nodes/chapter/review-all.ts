import { factCheckerPrompt, pedagogyReviewerPrompt, styleReviewerPrompt, subjectReviewerPrompt } from '../../prompts/subject-reviewer.ts'
import type { ChapterReviews, ReviewResult, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

async function runReview (prompt: string, state: TextbookStateType, reviewName: string): Promise<ReviewResult> {
  const chapterId = state.workflow.currentChapterId!
  const draft = state.drafts[chapterId]!

  return llmJsonCall<ReviewResult>(
    prompt,
    `教材：${state.textbookProject.title}\n目标读者：${state.textbookProject.audienceProfile}\n风格指南：${state.textbookProject.styleGuide}\n\n章节内容：\n${draft.content}`,
    `审校(${chapterId}/${reviewName})`,
  )
}

export async function reviewAll (state: TextbookStateType): Promise<{ reviews: Record<string, ChapterReviews> }> {
  const chapterId = state.workflow.currentChapterId!

  const [subjectReview, pedagogyReview, styleReview, factCheckReview] = await Promise.all([
    runReview(subjectReviewerPrompt, state, '学科'),
    runReview(pedagogyReviewerPrompt, state, '教学'),
    runReview(styleReviewerPrompt, state, '文风'),
    runReview(factCheckerPrompt, state, '事实'),
  ])

  return {
    reviews: {
      [chapterId]: {
        subjectReview,
        pedagogyReview,
        styleReview,
        factCheckReview,
      },
    },
  }
}
