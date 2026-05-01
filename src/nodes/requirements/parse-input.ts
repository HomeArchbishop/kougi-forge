import { requirementAnalystPrompt } from '../../prompts/requirement-analyst.ts'
import type { TextbookStateType, UserInput } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function parseInput (state: TextbookStateType): Promise<{ userInput: UserInput }> {
  const raw = state.userInput.rawInput

  const parsed = await llmJsonCall<Partial<UserInput>>(
    requirementAnalystPrompt,
    `用户输入：\n${raw}`,
    '解析用户需求',
  )

  return {
    userInput: {
      rawInput: raw,
      topic: parsed.topic ?? raw,
      targetAudience: parsed.targetAudience ?? null,
      level: parsed.level ?? null,
      purpose: parsed.purpose ?? null,
      style: parsed.style ?? null,
      length: parsed.length ?? null,
      format: parsed.format ?? null,
      language: parsed.language ?? '中文',
      needsExercises: parsed.needsExercises ?? null,
      needsCases: parsed.needsCases ?? null,
      needsProjects: parsed.needsProjects ?? null,
      needsReferences: parsed.needsReferences ?? null,
      needsTeacherGuide: parsed.needsTeacherGuide ?? null,
      needsSlides: parsed.needsSlides ?? null,
      constraints: parsed.constraints ?? [],
    },
  }
}
