import { Annotation } from '@langchain/langgraph'

import type {
  Blueprint,
  BlueprintCritique,
  BlueprintVariant,
  CaseWorld,
  ChapterDraft,
  ChapterExercises,
  ChapterPlan,
  ChapterReviews,
  ChapterSummary,
  ClarificationState,
  DraftVariant,
  FinalBook,
  GlossaryEntry,
  ResearchNotes,
  TextbookProject,
  UserInput,
  WorkflowState,
} from './common.ts'

export const TextbookState = Annotation.Root({
  userInput: Annotation<UserInput>,
  clarification: Annotation<ClarificationState>,
  textbookProject: Annotation<TextbookProject>,

  blueprintVariants: Annotation<BlueprintVariant[]>({
    reducer: (_prev, update) => update,
    default: () => [],
  }),
  blueprint: Annotation<Blueprint>,
  blueprintCritique: Annotation<BlueprintCritique | null>({
    reducer: (_prev, update) => update,
    default: () => null,
  }),

  chapterPlans: Annotation<Record<string, ChapterPlan>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
  research: Annotation<Record<string, ResearchNotes>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
  draftVariants: Annotation<Record<string, DraftVariant[]>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
  drafts: Annotation<Record<string, ChapterDraft>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
  reviews: Annotation<Record<string, ChapterReviews>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
  exercises: Annotation<Record<string, ChapterExercises>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
  chapterSummaries: Annotation<Record<string, ChapterSummary>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),

  glossary: Annotation<GlossaryEntry[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  caseWorld: Annotation<CaseWorld>,
  recurringIssues: Annotation<string[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),

  finalBook: Annotation<FinalBook>,

  workflow: Annotation<WorkflowState>,
})

export type TextbookStateType = typeof TextbookState.State
export type TextbookStateUpdate = typeof TextbookState.Update
