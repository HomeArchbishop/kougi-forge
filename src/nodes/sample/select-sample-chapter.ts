import type { WorkflowState } from '../../types/common.ts'
import type { TextbookStateType } from '../../types/index.ts'

export function selectSampleChapter (state: TextbookStateType): { workflow: WorkflowState } {
  const firstChapter = state.blueprint.tableOfContents[0]!
  return {
    workflow: {
      ...state.workflow,
      currentStage: 'sample_chapter',
      currentChapterId: firstChapter.chapterId,
      currentChapterIndex: 0,
    },
  }
}
