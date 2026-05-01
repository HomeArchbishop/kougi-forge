import { config } from '../config.ts'
import type { ChapterSummary, GlossaryEntry, TextbookProject, UserInput } from '../types/index.ts'
import type { Blueprint, ChapterPlan } from '../types/index.ts'

export interface ChapterContext {
  project: TextbookProject
  blueprint: Blueprint
  chapterPlan: ChapterPlan
  previousSummaries: ChapterSummary[]
  glossary: GlossaryEntry[]
  styleGuide: string
  researchNotes: string | null
  recurringIssues: string[]
  userInput: UserInput
}

function buildUserRequirementsBlock (ui: UserInput): string | null {
  const lines: string[] = []

  if (ui.length !== null) {
    lines.push(`篇幅要求（用户指定，必须遵守）：${ui.length}`)
  }
  if (ui.style !== null) lines.push(`写作风格：${ui.style}`)
  if (ui.purpose !== null) lines.push(`教材用途：${ui.purpose}`)
  if (ui.needsExercises === true) lines.push('需要练习题')
  if (ui.needsCases === true) lines.push('需要案例')
  if (ui.needsProjects === true) lines.push('需要项目实践')
  if (ui.needsReferences === true) lines.push('需要参考资料')
  if (ui.needsTeacherGuide === true) lines.push('需要教师用书')
  if (ui.needsSlides === true) lines.push('需要课件大纲')
  if (ui.constraints.length > 0) {
    lines.push(...ui.constraints.map(c => `特殊��求：${c}`))
  }

  return lines.length > 0 ? lines.join('\n') : null
}

export function buildChapterContext (ctx: ChapterContext): string {
  const parts: string[] = []

  parts.push(`# 教材项目
书名：${ctx.project.title}
副标题：${ctx.project.subtitle}
定位：${ctx.project.positioning}
目标读者：${ctx.project.audienceProfile}
教学方法：${ctx.project.pedagogicalApproach}`)

  parts.push(`\n# 风格指南
${ctx.styleGuide || ctx.project.styleGuide}`)

  const userReqs = buildUserRequirementsBlock(ctx.userInput)
  if (userReqs) {
    parts.push(`\n# 用户要求\n${userReqs}`)
  }

  parts.push(`\n# 全书目录
${ctx.blueprint.tableOfContents.map((ch, i) => `第${i + 1}章：${ch.title}`).join('\n')}`)

  if (ctx.previousSummaries.length > 0) {
    parts.push(`\n# 前文摘要
${ctx.previousSummaries.map(s => `## ${s.title}\n关键概念：${s.keyConcepts.join('、')}\n引入术语：${s.introducedTerms.join('、')}`).join('\n\n')}`)
  }

  if (ctx.glossary.length > 0) {
    parts.push(`\n# 术语表
${ctx.glossary.map(g => `- ${g.term}：${g.definition}`).join('\n')}`)
  }

  const wordCountLine = ctx.userInput.length !== null
    ? `【字数要求，必须遵守】本章需写约 ${ctx.project.estimatedWordsPerChapter.toLocaleString()} 字，各小节字数之和须达到此目标。`
    : `参考字数：约 ${ctx.project.estimatedWordsPerChapter.toLocaleString()} 字（可根据内容合理增减）`

  parts.push(`\n# 当前章节计划
章节：${ctx.chapterPlan.title}
${wordCountLine}
小节结构：
${ctx.chapterPlan.sections.map(s => `- ${s.id} ${s.title}（预计${s.estimatedWords}字，要点：${s.keyPoints.join('、')}）`).join('\n')}
示例：${ctx.chapterPlan.examples.join('、') || '无'}
案例：${ctx.chapterPlan.cases.join('、') || '无'}
练���计划：${ctx.chapterPlan.exercisesPlan}`)

  if (ctx.researchNotes) {
    parts.push(`\n# 研究资料
${ctx.researchNotes}`)
  }

  if (ctx.recurringIssues.length > 0) {
    parts.push(`\n# 需要避免的问题（前面章节审校发现的）
${ctx.recurringIssues.map(i => `- ${i}`).join('\n')}`)
  }

  return parts.join('\n')
}

export function buildOutputDir (project: TextbookProject): string {
  const slug = project.title
    .replace(/[《》]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
  return `${config.output.dir}/${slug}`
}
