import { blueprintMergePrompt } from '../../prompts/curriculum-architect.ts'
import type { Blueprint, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function compareAndMerge (state: TextbookStateType): Promise<{ blueprint: Blueprint }> {
  const variantsDescription = state.blueprintVariants.map((v, i) => (
    `方案${i + 1}（${v.approach}）：\n${JSON.stringify(v.blueprint, null, 2)}`
  )).join('\n\n---\n\n')

  const merged = await llmJsonCall<Blueprint>(
    blueprintMergePrompt,
    `教材项目定义：\n${JSON.stringify(state.textbookProject, null, 2)}\n\n以下是三个蓝图方案：\n\n${variantsDescription}`,
    '比较融合蓝图',
  )

  return {
    blueprint: {
      ...merged,
      confirmedByUser: false,
    },
  }
}
