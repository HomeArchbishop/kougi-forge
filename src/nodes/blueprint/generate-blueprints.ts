import { blueprintVariantPrompt } from '../../prompts/curriculum-architect.ts'
import type { Blueprint, BlueprintVariant, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

const APPROACHES = ['理论系统型', '实践项目型', '案例驱动型']

export async function generateBlueprints (state: TextbookStateType): Promise<{ blueprintVariants: BlueprintVariant[] }> {
  const p = state.textbookProject
  const ui = state.userInput
  const projectInfo = JSON.stringify(p, null, 2)

  const hardConstraints: string[] = []
  const guidance: string[] = []

  if (ui.length !== null) {
    hardConstraints.push(`用户明确指定了篇幅要求："${ui.length}"`)
    hardConstraints.push(`tableOfContents 必须恰好包含 ${p.estimatedChapters} 章，不多不少`)
    hardConstraints.push(`每章 estimatedWords 必须约为 ${p.estimatedWordsPerChapter} 字`)
  } else {
    guidance.push(`参考章节数：约 ${p.estimatedChapters} 章（可根据内容合理调整，以覆盖主题为准）`)
    guidance.push(`参考每章字数：约 ${p.estimatedWordsPerChapter} 字（各章可不同，由内容深度决定）`)
  }

  if (ui.constraints.length > 0) {
    hardConstraints.push(...ui.constraints.map(c => `用户要求：${c}`))
  }

  const parts: string[] = [`教材项目定义：\n${projectInfo}`]
  if (hardConstraints.length > 0) {
    parts.push(`\n硬性约束（不可违反）：\n${hardConstraints.map(c => `- ${c}`).join('\n')}`)
  }
  if (guidance.length > 0) {
    parts.push(`\n规划参考：\n${guidance.map(c => `- ${c}`).join('\n')}`)
  }
  const userMessage = parts.join('\n')

  const results = await Promise.all(
    APPROACHES.map(async (approach) => {
      const blueprint = await llmJsonCall<Blueprint>(
        blueprintVariantPrompt(approach),
        userMessage,
        `生成蓝图(${approach})`,
      )
      return { approach, blueprint, score: 0 }
    }),
  )

  return { blueprintVariants: results }
}
