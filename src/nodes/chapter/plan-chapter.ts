import { chapterPlannerPrompt } from '../../prompts/chapter-writer.ts'
import type { ChapterPlan, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function planChapter (state: TextbookStateType): Promise<{ chapterPlans: Record<string, ChapterPlan> }> {
  const chapterId = state.workflow.currentChapterId!
  const chapterOutline = state.blueprint.tableOfContents.find(ch => ch.chapterId === chapterId)!

  const plan = await llmJsonCall<ChapterPlan>(
    chapterPlannerPrompt,
    `教材项目：${state.textbookProject.title}\n目标读者：${state.textbookProject.audienceProfile}\n\n当前章节信息：\n${JSON.stringify(chapterOutline, null, 2)}\n\n全书目录：\n${state.blueprint.tableOfContents.map(ch => `${ch.chapterId}: ${ch.title}`).join('\n')}`,
    `规划章节(${chapterId})`,
  )

  return {
    chapterPlans: { [chapterId]: { ...plan, chapterId } },
  }
}
