import type { TextbookStateType, UserInput } from '../../types/index.ts'

const DEFAULTS: Partial<UserInput> = {
  targetAudience: '有基本阅读能力但无专业基础的初学者',
  level: '入门到中级',
  purpose: '系统学习',
  style: '理论与实践结合',
  format: 'markdown',
  needsExercises: false,
  needsCases: true,
  needsProjects: false,
  needsReferences: true,
  needsTeacherGuide: false,
  needsSlides: false,
}

export function fillDefaults (state: TextbookStateType): { userInput: UserInput } {
  const filled = { ...state.userInput }

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    const k = key as keyof UserInput
    if (filled[k] === null || filled[k] === undefined) {
      (filled as Record<string, unknown>)[k] = defaultValue
    }
  }

  return { userInput: filled }
}
