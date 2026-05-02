import type { WorkflowState } from '../../types/common.ts'
import type { TextbookStateType } from '../../types/index.ts'

export function selectNextChapter (state: TextbookStateType): { workflow: WorkflowState } {
  const nextIndex = state.workflow.currentChapterIndex + 1
  const chapter = state.blueprint.tableOfContents[nextIndex]

  return {
    workflow: {
      ...state.workflow,
      currentStage: chapter ? 'chapter_production' : 'book_assembly',
      currentChapterId: chapter?.chapterId ?? null,
      currentChapterIndex: nextIndex,
      revisionRound: 0,
    },
  }
}
