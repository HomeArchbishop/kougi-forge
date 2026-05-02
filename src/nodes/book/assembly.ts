import { interrupt } from '@langchain/langgraph'

import { config } from '../../config.ts'
import { isAutoYes } from '../../global-env.ts'
import { consistencyCheckerPrompt, formatterPrompt } from '../../prompts/consistency-checker.ts'
import type { FinalBook, TextbookStateType, WorkflowState } from '../../types/index.ts'
import { buildOutputDir } from '../../utils/context-builder.ts'
import { ensureOutputDir, writeBook, writeChapter } from '../../utils/file-writer.ts'
import type { InterruptPayload } from '../../utils/logger.ts'
import { llmCall, llmJsonCall } from '../../utils/structured-output.ts'

export async function assembleBook (state: TextbookStateType): Promise<{ finalBook: FinalBook; workflow: WorkflowState }> {
  const chapters = state.blueprint.tableOfContents.map(ch => {
    const draft = state.drafts[ch.chapterId]
    return draft?.content ?? ''
  })

  const frontMatter = await llmCall(
    formatterPrompt,
    `请为以下教材生成前言和使用说明。\n\n书名：${state.textbookProject.title}\n副标题：${state.textbookProject.subtitle}\n定位：${state.textbookProject.positioning}\n目标读者：${state.textbookProject.audienceProfile}\n学习目标：\n${state.textbookProject.learningGoals.join('\n')}\n\n共${chapters.length}章`,
    '生成前言',
  )

  const glossary = state.glossary
    .map(g => `**${g.term}**：${g.definition}`)
    .join('\n\n')

  return {
    finalBook: {
      chapters,
      artifacts: {
        'front-matter': frontMatter,
        glossary,
      },
    },
    workflow: { ...state.workflow, currentStage: 'book_assembly' },
  }
}

export async function consistencyCheck (state: TextbookStateType): Promise<{ recurringIssues: string[]; workflow: WorkflowState }> {
  const chapterSummaries = Object.values(state.chapterSummaries)
    .map(s => `${s.title}: 概念[${s.keyConcepts.join(',')}] 术语[${s.introducedTerms.join(',')}]`)
    .join('\n')

  const check = await llmJsonCall<{
    terminologyIssues: { problem: string }[]
    structuralIssues: string[]
    gaps: string[]
    redundancies: { topic: string }[]
  }>(
    consistencyCheckerPrompt,
    `教材：${state.textbookProject.title}\n\n章节摘要：\n${chapterSummaries}\n\n术语表：\n${state.glossary.map(g => `${g.term}(${g.firstAppearedChapter}): ${g.definition}`).join('\n')}`,
    '一致性检查',
  )

  const issues: string[] = [
    ...check.terminologyIssues.map(i => `术语问题：${i.problem}`),
    ...check.structuralIssues,
    ...check.gaps.map(g => `缺口：${g}`),
    ...check.redundancies.map(r => `重复：${r.topic}`),
  ]

  return {
    recurringIssues: issues,
    workflow: { ...state.workflow, revisionChapterIndex: 0 },
  }
}

export async function globalRevision (state: TextbookStateType): Promise<{ finalBook: FinalBook; workflow: WorkflowState }> {
  const i = state.workflow.revisionChapterIndex
  const chapters = state.finalBook.chapters

  if (!state.recurringIssues.length || i >= chapters.length) {
    return {
      finalBook: state.finalBook,
      workflow: { ...state.workflow, revisionChapterIndex: chapters.length },
    }
  }

  const chapter = chapters[i]!
  const relevantIssues = state.recurringIssues.filter(issue =>
    issue.includes(`ch${String(i + 1).padStart(2, '0')}`) || issue.includes('全书'),
  )

  const updatedChapters = [...chapters]
  if (relevantIssues.length > 0) {
    updatedChapters[i] = await llmCall(
      '你是教材修订编辑。请根据以下全书一致性问题修订这个章节。只修改需要修改的部分，保持其他内容不变。直接输出修改后的完整 Markdown 章节。',
      `问题：\n${relevantIssues.join('\n')}\n\n章节内容：\n${chapter}`,
      `全书修订(ch${i + 1})`,
    )
  }

  return {
    finalBook: { ...state.finalBook, chapters: updatedChapters },
    workflow: { ...state.workflow, revisionChapterIndex: i + 1 },
  }
}

export async function formatOutput (state: TextbookStateType): Promise<{ finalBook: FinalBook; workflow: WorkflowState }> {
  const outputDir = await ensureOutputDir(state.textbookProject)
  const ui = state.userInput

  for (let i = 0; i < state.finalBook.chapters.length; i++) {
    const ch = state.blueprint.tableOfContents[i]!
    await writeChapter(outputDir, ch.chapterId, state.finalBook.chapters[i] ?? '')
  }

  const updatedArtifacts: Record<string, string> = { ...state.finalBook.artifacts }

  if (ui.needsExercises === true) {
    updatedArtifacts['exercise-bank'] = Object.entries(state.exercises)
      .map(([id, ex]) => `## ${state.chapterPlans[id]?.title ?? id}\n\n${ex.questions.map(q => `${q.id}. [${q.type}/${q.difficulty}] ${q.content}`).join('\n')}`)
      .join('\n\n')

    updatedArtifacts['answer-key'] = Object.entries(state.exercises)
      .map(([id, ex]) => `## ${state.chapterPlans[id]?.title ?? id}\n\n${ex.answers.map(a => `${a.questionId}: ${a.answer}\n   ${a.explanation}`).join('\n')}`)
      .join('\n\n')
  }

  const optionalLlm: Array<[string, Promise<string>]> = []

  if (ui.needsTeacherGuide === true) {
    optionalLlm.push(['teacher-guide', llmCall(
      formatterPrompt,
      `请为以下教材生成教师用书大纲。\n\n书名：${state.textbookProject.title}\n目录：${state.blueprint.tableOfContents.map(ch => ch.title).join('、')}\n教学方法：${state.textbookProject.pedagogicalApproach}`,
      '生成教师用书',
    )])
  }

  if (ui.needsSlides === true) {
    optionalLlm.push(['slides-outline', llmCall(
      formatterPrompt,
      `请为以下教材生成课件大纲（每章主要幻灯片标题和要点）。\n\n书名：${state.textbookProject.title}\n目录：${state.blueprint.tableOfContents.map(ch => `${ch.title}: ${ch.learningObjectives.join('、')}`).join('\n')}`,
      '生成课件大纲',
    )])
  }

  const results = await Promise.all(optionalLlm.map(([, p]) => p))
  for (let i = 0; i < optionalLlm.length; i++) {
    updatedArtifacts[optionalLlm[i]![0]] = results[i]!
  }

  for (const [key, content] of Object.entries(updatedArtifacts)) {
    if (content) await writeBook(outputDir, `${key}.md`, content)
  }

  return {
    finalBook: { ...state.finalBook, artifacts: updatedArtifacts },
    workflow: { ...state.workflow, currentStage: 'done' },
  }
}

export function finalConfirmation (state: TextbookStateType): { workflow: WorkflowState } {
  const outputDir = buildOutputDir(state.textbookProject)
  const chapterCount = state.finalBook.chapters.length
  const totalWords = state.finalBook.chapters.reduce((sum, ch) => sum + ch.length, 0)
  const artifactList = Object.keys(state.finalBook.artifacts)
    .map(k => `    ${k}.md`)
    .join('\n')

  const payload: InterruptPayload = {
    message: `教材生成完成

  书名：${state.textbookProject.title}
  ${state.textbookProject.subtitle}

  模型：${config.llm.model}
  章节：共 ${chapterCount} 章
  字数：约 ${Math.round(totalWords / 1000)}k 字
  术语：${state.glossary.length} 个术语

  输出目录：${outputDir}/
    chapters/   各章正文
${artifactList}`,
    options: [
      { label: '完成，结束生成', value: '完成' },
      { label: '提出后续修改要求', value: '' },
    ],
  }

  if (!isAutoYes()) {
    interrupt<InterruptPayload, string>(payload)
  }

  return {
    workflow: { ...state.workflow, currentStage: 'done' },
  }
}
