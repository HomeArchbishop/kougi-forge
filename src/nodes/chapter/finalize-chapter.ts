import type { ChapterDraft, ChapterSummary, GlossaryEntry, TextbookStateType, WorkflowState } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function finalizeChapter (state: TextbookStateType): Promise<{
  drafts: Record<string, ChapterDraft>
  chapterSummaries: Record<string, ChapterSummary>
  glossary: GlossaryEntry[]
  workflow: WorkflowState
}> {
  const chapterId = state.workflow.currentChapterId!
  const draft = state.drafts[chapterId]!

  const summaryData = await llmJsonCall<Omit<ChapterSummary, 'chapterId' | 'title'>>(
    `请为以下教材章节生成摘要信息，用于后续章节写作时参考。

以JSON格式返回：
{
  "keyConcepts": ["关键概念1"],
  "definitions": {"术语": "定义"},
  "introducedTerms": ["新引入的术语"],
  "examplesUsed": ["使用的示例"],
  "exercisesSummary": "练习题概况"
}`,
    `章节内容：\n${draft.content.slice(0, 3000)}`,
    `章节摘要(${chapterId})`,
  )

  const plan = state.chapterPlans[chapterId]!
  const summary: ChapterSummary = {
    chapterId,
    title: plan.title,
    ...summaryData,
  }

  const newGlossaryEntries: GlossaryEntry[] = summaryData.introducedTerms.map(term => ({
    term,
    definition: summaryData.definitions[term] ?? '',
    firstAppearedChapter: chapterId,
    synonyms: [],
    forbiddenVariants: [],
  })).filter(g => g.definition)

  const completedChapters = [...state.workflow.completedChapters, chapterId]
  const nextIndex = state.workflow.currentChapterIndex + 1
  const totalChapters = state.blueprint.tableOfContents.length

  return {
    drafts: {
      [chapterId]: { ...draft, status: 'approved' },
    },
    chapterSummaries: { [chapterId]: summary },
    glossary: newGlossaryEntries,
    workflow: {
      ...state.workflow,
      completedChapters,
      currentChapterIndex: nextIndex,
      currentChapterId: null,
      revisionRound: 0,
      currentStage: nextIndex >= totalChapters ? 'book_assembly' : 'chapter_production',
    },
  }
}
