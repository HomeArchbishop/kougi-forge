export interface ReviewResult {
  score: number
  passed: boolean
  criticalIssues: string[]
  minorIssues: string[]
  suggestions: string[]
  requiredRevisions: string[]
}

export interface QualityScores {
  contentCompleteness: number
  professionalAccuracy: number
  teachingEffectiveness: number
  structuralClarity: number
  languageStyle: number
  exerciseQuality: number
  formatConsistency: number
}

export type DraftStatus = 'drafted' | 'reviewed' | 'revised' | 'approved'

export type WorkflowStage =
  | 'requirements'
  | 'blueprint'
  | 'sample_chapter'
  | 'chapter_production'
  | 'book_assembly'
  | 'done'

export interface UserInput {
  rawInput: string
  topic: string
  targetAudience: string | null
  level: string | null
  purpose: string | null
  style: string | null
  length: string | null
  format: string | null
  language: string
  needsExercises: boolean | null
  needsCases: boolean | null
  needsProjects: boolean | null
  needsReferences: boolean | null
  needsTeacherGuide: boolean | null
  needsSlides: boolean | null
  constraints: string[]
}

export interface ClarificationState {
  missingFields: string[]
  questions: string[]
  userAnswers: Record<string, string>
  round: number
  isSufficient: boolean
}

export interface TextbookProject {
  title: string
  subtitle: string
  positioning: string
  audienceProfile: string
  learningGoals: string[]
  prerequisites: string[]
  pedagogicalApproach: string
  estimatedChapters: number
  estimatedWordsPerChapter: number
  outputFormat: string
  styleGuide: string
}

export interface ChapterOutline {
  chapterId: string
  title: string
  purpose: string
  learningObjectives: string[]
  keyTopics: string[]
  estimatedWords: number
  prerequisites: string[]
}

export interface Blueprint {
  tableOfContents: ChapterOutline[]
  globalLearningPath: string
  chapterDependencies: Record<string, string[]>
  difficultyProgression: string
  caseThread: string | null
  confirmedByUser: boolean
}

export interface BlueprintVariant {
  approach: string
  blueprint: Blueprint
  score: number
}

export interface ChapterPlan {
  chapterId: string
  title: string
  sections: SectionPlan[]
  examples: string[]
  cases: string[]
  diagrams: string[]
  exercisesPlan: string
  expectedDepth: string
}

export interface SectionPlan {
  id: string
  title: string
  keyPoints: string[]
  estimatedWords: number
}

export interface ResearchNotes {
  keyFacts: string[]
  usefulExamples: string[]
  references: { title: string; source: string; relevance: string }[]
  warnings: string[]
}

export interface DraftVariant {
  approach: string
  content: string
  wordCount: number
}

export interface ChapterDraft {
  chapterId: string
  version: number
  content: string
  status: DraftStatus
  wordCount: number
}

export interface ChapterReviews {
  subjectReview: ReviewResult | null
  pedagogyReview: ReviewResult | null
  styleReview: ReviewResult | null
  factCheckReview: ReviewResult | null
}

export interface ChapterExercises {
  questions: ExerciseQuestion[]
  answers: ExerciseAnswer[]
  knowledgeMapping: Record<string, string[]>
}

export interface ExerciseQuestion {
  id: string
  type: 'choice' | 'true_false' | 'short_answer' | 'essay' | 'case_analysis' | 'practical' | 'project'
  difficulty: 'basic' | 'intermediate' | 'advanced'
  content: string
  options?: string[]
}

export interface ExerciseAnswer {
  questionId: string
  answer: string
  explanation: string
  scoringPoints: string[]
}

export interface ChapterSummary {
  chapterId: string
  title: string
  keyConcepts: string[]
  definitions: Record<string, string>
  introducedTerms: string[]
  examplesUsed: string[]
  exercisesSummary: string
}

export interface GlossaryEntry {
  term: string
  definition: string
  firstAppearedChapter: string
  synonyms: string[]
  forbiddenVariants: string[]
}

export interface CaseWorld {
  companyName: string | null
  productName: string | null
  characters: string[]
  businessContext: string
  projectStage: string
  decisionsHistory: string[]
}

export interface FinalBook {
  chapters: string[]                // ordered chapter content, indexed by position
  artifacts: Record<string, string> // filename (without .md) → content
}

export interface BlueprintCritique {
  score: number
  passed: boolean
  criticalIssues: string[]
  suggestions: string[]
  requiredRevisions: string[]
}

export interface WorkflowState {
  currentStage: WorkflowStage
  currentChapterId: string | null
  currentChapterIndex: number
  revisionRound: number
  revisionChapterIndex: number
  maxRevisionRounds: number
  completedChapters: string[]
  errors: string[]
}
