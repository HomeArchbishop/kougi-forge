import { researcherPrompt } from '../../prompts/researcher.ts'
import type { ResearchNotes, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function research (state: TextbookStateType): Promise<{ research: Record<string, ResearchNotes> }> {
  const chapterId = state.workflow.currentChapterId!
  const plan = state.chapterPlans[chapterId]!

  const notes = await llmJsonCall<ResearchNotes>(
    researcherPrompt,
    `教材：${state.textbookProject.title}\n章节：${plan.title}\n核心主题：${plan.sections.map(s => s.title).join('、')}`,
    `研究资料(${chapterId})`,
  )

  return { research: { [chapterId]: notes } }
}
