import { exerciseDesignerPrompt, exerciseReviewerPrompt } from '../../prompts/exercise-designer.ts'
import type { ChapterExercises, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function generateExercises (state: TextbookStateType): Promise<{ exercises: Record<string, ChapterExercises> }> {
  const chapterId = state.workflow.currentChapterId!
  const draft = state.drafts[chapterId]!
  const plan = state.chapterPlans[chapterId]!

  const exercises = await llmJsonCall<ChapterExercises>(
    exerciseDesignerPrompt,
    `章节：${plan.title}\n学习目标：${state.blueprint.tableOfContents.find(ch => ch.chapterId === chapterId)?.learningObjectives.join('、')}\n\n章节内容概要：\n${draft.content.slice(0, 2000)}`,
    `生成练习题(${chapterId})`,
  )

  return { exercises: { [chapterId]: exercises } }
}

export async function reviewExercises (state: TextbookStateType): Promise<{ exercises: Record<string, ChapterExercises> }> {
  const chapterId = state.workflow.currentChapterId!
  const exercises = state.exercises[chapterId]!

  const review = await llmJsonCall<{ passed: boolean; requiredRevisions: string[] }>(
    exerciseReviewerPrompt,
    `章节练习题：\n${JSON.stringify(exercises, null, 2)}`,
    `审查练习题(${chapterId})`,
  )

  if (!review.passed && review.requiredRevisions.length > 0) {
    const fixed = await llmJsonCall<ChapterExercises>(
      exerciseDesignerPrompt + '\n\n请根据以下审查意见修改练习题：\n' + review.requiredRevisions.join('\n'),
      `原练习题：\n${JSON.stringify(exercises, null, 2)}`,
      `修订练习题(${chapterId})`,
    )
    return { exercises: { [chapterId]: fixed } }
  }

  return { exercises: { [chapterId]: exercises } }
}
