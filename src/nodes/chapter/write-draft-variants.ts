import { chapterWriterPrompt, draftSynthesizerPrompt } from '../../prompts/chapter-writer.ts'
import type { ChapterDraft, DraftVariant, TextbookStateType } from '../../types/index.ts'
import { buildChapterContext } from '../../utils/context-builder.ts'
import { llmCall } from '../../utils/structured-output.ts'

const VARIANTS = ['popular', 'rigorous', 'case-based'] as const

export async function writeDraftVariants (state: TextbookStateType): Promise<{ draftVariants: Record<string, DraftVariant[]> }> {
  const chapterId = state.workflow.currentChapterId!
  const plan = state.chapterPlans[chapterId]!

  const previousSummaries = Object.values(state.chapterSummaries ?? {})
    .filter(s => {
      const idx = state.blueprint.tableOfContents.findIndex(ch => ch.chapterId === s.chapterId)
      const currentIdx = state.blueprint.tableOfContents.findIndex(ch => ch.chapterId === chapterId)
      return idx < currentIdx
    })

  const context = buildChapterContext({
    project: state.textbookProject,
    blueprint: state.blueprint,
    chapterPlan: plan,
    previousSummaries,
    glossary: state.glossary ?? [],
    styleGuide: state.textbookProject.styleGuide,
    researchNotes: state.research?.[chapterId]
      ? JSON.stringify(state.research[chapterId])
      : null,
    recurringIssues: state.recurringIssues ?? [],
    userInput: state.userInput,
  })

  const variants = await Promise.all(
    VARIANTS.map(async (variant) => {
      const content = await llmCall(
        chapterWriterPrompt(variant),
        context,
        `撰写章节(${chapterId}/${variant})`,
      )
      return {
        approach: variant,
        content,
        wordCount: content.length,
      }
    }),
  )

  return { draftVariants: { [chapterId]: variants } }
}

export async function synthesizeDraft (state: TextbookStateType): Promise<{ drafts: Record<string, ChapterDraft> }> {
  const chapterId = state.workflow.currentChapterId!
  const variants = state.draftVariants[chapterId] ?? []

  if (variants.length === 1) {
    return {
      drafts: {
        [chapterId]: {
          chapterId,
          version: 1,
          content: variants[0]!.content,
          status: 'drafted',
          wordCount: variants[0]!.wordCount,
        },
      },
    }
  }

  const variantsText = variants
    .map((v, i) => `=== 版本${i + 1}（${v.approach}）===\n${v.content}`)
    .join('\n\n')

  const synthesized = await llmCall(
    draftSynthesizerPrompt,
    `教材：${state.textbookProject.title}\n目标读者：${state.textbookProject.audienceProfile}\n风格指南：${state.textbookProject.styleGuide}\n【字数要求】本章需达到约 ${state.textbookProject.estimatedWordsPerChapter.toLocaleString()} 字\n\n以下是三个版本：\n\n${variantsText}`,
    `综合草稿(${chapterId})`,
  )

  return {
    drafts: {
      [chapterId]: {
        chapterId,
        version: 1,
        content: synthesized,
        status: 'drafted',
        wordCount: synthesized.length,
      },
    },
  }
}
