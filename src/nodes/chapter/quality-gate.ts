import { config } from '../../config.ts'
import type { TextbookStateType } from '../../types/index.ts'

export interface QualityGateResult {
  passed: boolean
  reason: string
}

export function qualityGate (state: TextbookStateType): QualityGateResult {
  const chapterId = state.workflow.currentChapterId!
  const reviews = state.reviews[chapterId]

  if (!reviews) return { passed: false, reason: 'no reviews' }

  const scores = [
    reviews.subjectReview?.score ?? 0,
    reviews.pedagogyReview?.score ?? 0,
    reviews.styleReview?.score ?? 0,
    reviews.factCheckReview?.score ?? 0,
  ]

  const minScore = Math.min(...scores)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

  const hasCriticalIssues = [
    ...reviews.subjectReview?.criticalIssues ?? [],
    ...reviews.pedagogyReview?.criticalIssues ?? [],
    ...reviews.styleReview?.criticalIssues ?? [],
    ...reviews.factCheckReview?.criticalIssues ?? [],
  ].length > 0

  if (minScore >= config.quality.chapterPassScore && !hasCriticalIssues) {
    return { passed: true, reason: `all scores >= ${config.quality.chapterPassScore}` }
  }

  if (state.workflow.revisionRound >= config.quality.chapterMaxRevisionRounds) {
    return { passed: true, reason: `max revision rounds (${config.quality.chapterMaxRevisionRounds}) reached, force pass with avg=${avgScore.toFixed(1)}` }
  }

  return { passed: false, reason: `min score ${minScore} < ${config.quality.chapterPassScore}` }
}
