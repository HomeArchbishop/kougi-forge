import { interrupt } from '@langchain/langgraph'

import type { TextbookProject, WorkflowState } from '../../types/common.ts'
import type { TextbookStateType } from '../../types/index.ts'
import type { InterruptPayload } from '../../utils/logger.ts'

export function confirmSampleChapter (state: TextbookStateType): { textbookProject: TextbookProject; workflow: WorkflowState } {
  const chapterId = state.workflow.currentChapterId!
  const draft = state.drafts[chapterId]
  const preview = draft?.content?.slice(0, 3000) ?? '（未生成）'

  const payload: InterruptPayload = {
    message: `以下是样章预览（第1章前3000字）：\n\n${preview}\n\n...`,
    options: [
      { label: '确认，按此风格继续生成所有章节', value: '确认' },
      { label: '提出风格调整意见', value: '' },
      { label: '重写样章', value: '重写' },
    ],
  }

  const userResponse = interrupt<InterruptPayload, string>(payload)

  const isApproved = userResponse === '确认'

  let updatedStyleGuide = state.textbookProject.styleGuide
  if (!isApproved && userResponse !== '重写') {
    updatedStyleGuide = `${updatedStyleGuide}\n\n用户补充的风格要求：${userResponse}`
  }

  return {
    textbookProject: { ...state.textbookProject, styleGuide: updatedStyleGuide },
    workflow: {
      ...state.workflow,
      currentStage: isApproved ? 'chapter_production' : 'sample_chapter',
      currentChapterIndex: isApproved ? 1 : 0,
    },
  }
}
