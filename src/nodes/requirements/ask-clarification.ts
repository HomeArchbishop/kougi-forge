import { interrupt } from '@langchain/langgraph'

import { clarificationQuestionsPrompt } from '../../prompts/requirement-analyst.ts'
import type { ClarificationState, TextbookStateType, UserInput } from '../../types/index.ts'
import type { InterruptPayload } from '../../utils/logger.ts'
import { llmCall } from '../../utils/structured-output.ts'

export async function generateQuestions (state: TextbookStateType): Promise<{ clarification: ClarificationState }> {
  const result = await llmCall(
    clarificationQuestionsPrompt,
    `缺失字段：${state.clarification.missingFields.join('、')}\n\n当前已有信息：\n${JSON.stringify(state.userInput, null, 2)}`,
    '生成澄清问题',
  )

  const cleaned = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const parsed = JSON.parse(cleaned) as { questions: string[] }

  return {
    clarification: {
      ...state.clarification,
      questions: parsed.questions,
    },
  }
}

export async function askClarification (state: TextbookStateType): Promise<{ clarification: ClarificationState; userInput: UserInput }> {
  const questions = state.clarification.questions
  const questionsText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n')

  const payload: InterruptPayload = {
    message: `为了更好地设计教材，我需要确认几个问题：\n\n${questionsText}`,
    options: [
      { label: '逐一回答以上问题', value: '' },
      { label: '跳过，使用默认设置', value: '跳过' },
    ],
  }

  const userResponse = interrupt<InterruptPayload, string>(payload)

  const updatedAnswers = { ...state.clarification.userAnswers }
  updatedAnswers[`round_${state.clarification.round + 1}`] = userResponse

  const updatedInput = { ...state.userInput }
  if (userResponse && userResponse !== '跳过') {
    updatedInput.rawInput = `${updatedInput.rawInput}\n\n补充信息：${userResponse}`
  }

  return {
    clarification: {
      ...state.clarification,
      userAnswers: updatedAnswers,
      round: state.clarification.round + 1,
      isSufficient: userResponse === '跳过',
    },
    userInput: updatedInput,
  }
}
