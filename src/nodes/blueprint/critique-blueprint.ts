import { blueprintCriticPrompt } from '../../prompts/curriculum-architect.ts'
import type { BlueprintCritique } from '../../types/common.ts'
import type { TextbookStateType, WorkflowState } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function critiqueBlueprint (state: TextbookStateType): Promise<{ blueprintCritique: BlueprintCritique; workflow: WorkflowState }> {
  const critique = await llmJsonCall<BlueprintCritique>(
    blueprintCriticPrompt,
    `教材项目定义：\n${JSON.stringify(state.textbookProject, null, 2)}\n\n待评审蓝图：\n${JSON.stringify(state.blueprint, null, 2)}`,
    '蓝图评审',
  )

  return {
    blueprintCritique: critique,
    workflow: {
      ...state.workflow,
      revisionRound: state.workflow.revisionRound + 1,
    },
  }
}
