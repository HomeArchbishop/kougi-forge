import { interrupt } from '@langchain/langgraph'

import type { Blueprint, TextbookStateType, WorkflowState } from '../../types/index.ts'
import type { InterruptPayload } from '../../utils/logger.ts'

export function confirmBlueprint (state: TextbookStateType): { blueprint: Blueprint; workflow?: WorkflowState } {
  const toc = state.blueprint.tableOfContents
    .map((ch, i) => `第${i + 1}章：${ch.title}\n   目的：${ch.purpose}\n   学习目标：${ch.learningObjectives.join('、')}`)
    .join('\n\n')

  const message = `教材蓝图如下：

书：${state.textbookProject.title}
${state.textbookProject.subtitle ? `副标题：${state.textbookProject.subtitle}` : ''}
学习路径：${state.blueprint.globalLearningPath}
难度渐进：${state.blueprint.difficultyProgression}
${state.blueprint.caseThread ? `贯穿案例：${state.blueprint.caseThread}` : ''}

目录：
${toc}`

  const payload: InterruptPayload = {
    message,
    options: [
      { label: '确认，按此蓝图继续生成', value: '确认' },
      { label: '提出修改意见', value: '' },
      { label: '重新设计蓝图', value: '重新设计' },
    ],
  }

  const userResponse = interrupt<InterruptPayload, string>(payload)

  const isApproved = userResponse === '确认'

  return {
    blueprint: {
      ...state.blueprint,
      confirmedByUser: isApproved,
    },
    workflow: isApproved
      ? { ...state.workflow, currentStage: 'sample_chapter' }
      : undefined,
  }
}
