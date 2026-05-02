import { projectDefPrompt } from '../../prompts/requirement-analyst.ts'
import type { TextbookProject, TextbookStateType, WorkflowState } from '../../types/index.ts'
import { logProjectDef } from '../../utils/logger.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function generateProjectDef (state: TextbookStateType): Promise<{ textbookProject: TextbookProject; workflow: WorkflowState }> {
  const parsed = await llmJsonCall<TextbookProject>(
    projectDefPrompt,
    `确认的需求信息：\n${JSON.stringify(state.userInput, null, 2)}`,
    '生成项目定义',
  )

  const project: TextbookProject = {
    title: parsed.title ?? `《${state.userInput.topic}》`,
    subtitle: parsed.subtitle ?? '',
    positioning: parsed.positioning ?? '',
    audienceProfile: parsed.audienceProfile ?? state.userInput.targetAudience ?? '',
    learningGoals: parsed.learningGoals ?? [],
    prerequisites: parsed.prerequisites ?? [],
    pedagogicalApproach: parsed.pedagogicalApproach ?? '',
    estimatedChapters: parsed.estimatedChapters ?? 10,
    estimatedWordsPerChapter: parsed.estimatedWordsPerChapter ?? 7000,
    outputFormat: parsed.outputFormat ?? state.userInput.format ?? 'markdown',
    styleGuide: parsed.styleGuide ?? '',
  }

  logProjectDef(project)

  return {
    textbookProject: project,
    workflow: {
      currentStage: 'blueprint',
      currentChapterId: null,
      currentChapterIndex: -1,
      revisionRound: 0,
      revisionChapterIndex: 0,
      maxRevisionRounds: 3,
      completedChapters: [],
      errors: [],
    },
  }
}
