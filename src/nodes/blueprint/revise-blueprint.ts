import type { Blueprint, TextbookStateType } from '../../types/index.ts'
import { llmJsonCall } from '../../utils/structured-output.ts'

export async function reviseBlueprint (state: TextbookStateType): Promise<{ blueprint: Blueprint }> {
  const critique = state.blueprintCritique
  const revisions = critique?.requiredRevisions ?? []
  const suggestions = critique?.suggestions ?? []

  const revised = await llmJsonCall<Blueprint>(
    `你是教材架构设计师。请根据评审意见修订教材蓝图。

修订要求：
- 只修改需要修改的部分，保持其他部分不变
- 确保修改后的蓝图结构完整一致
- 修改后需要保持难度递进和章节衔接

以与原蓝图相同的JSON格式返回完整修订后的蓝图。`,
    `原蓝图：\n${JSON.stringify(state.blueprint, null, 2)}\n\n必须修改：\n${revisions.join('\n')}\n\n建议修改：\n${suggestions.join('\n')}`,
    '修订蓝图',
  )

  return {
    blueprint: {
      ...revised,
      confirmedByUser: false,
    },
  }
}
