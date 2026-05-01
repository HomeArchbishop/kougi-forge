import type { WorkflowState } from '../../types/common.ts'
import type { TextbookStateType } from '../../types/index.ts'

export function selectNextChapter (state: TextbookStateType): { workflow: WorkflowState } {
  const idx = state.workflow.currentChapterIndex
  const chapter = state.blueprint.tableOfContents[idx]
  return {
    workflow: {
      ...state.workflow,
      currentStage: chapter ? 'chapter_production' : 'book_assembly',
      currentChapterId: chapter?.chapterId ?? null,
      revisionRound: 0,
    },
  }
}
