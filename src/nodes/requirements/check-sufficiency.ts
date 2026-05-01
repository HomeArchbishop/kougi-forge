import { sufficiencyCheckPrompt } from '../../prompts/requirement-analyst.ts'
import type { ClarificationState, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function checkSufficiency (state: TextbookStateType): Promise<{ clarification: ClarificationState }> {
  // User explicitly chose to skip clarification — respect that decision
  if (state.clarification?.isSufficient) {
    return { clarification: state.clarification }
  }

  const parsed = await llmJsonCall<{ isSufficient: boolean; missingFields: string[] }>(
    sufficiencyCheckPrompt,
    `当前需求信息：\n${JSON.stringify(state.userInput, null, 2)}`,
    '检查需求完整性',
  )

  const currentRound = state.clarification?.round ?? 0

  return {
    clarification: {
      missingFields: parsed.missingFields,
      questions: state.clarification?.questions ?? [],
      userAnswers: state.clarification?.userAnswers ?? {},
      round: currentRound,
      isSufficient: parsed.isSufficient,
    },
  }
}
