import { END, START, StateGraph } from '@langchain/langgraph'

import { compareAndMerge } from '../nodes/blueprint/compare-and-merge.ts'
import { confirmBlueprint } from '../nodes/blueprint/confirm-blueprint.ts'
import { critiqueBlueprint } from '../nodes/blueprint/critique-blueprint.ts'
import { generateBlueprints } from '../nodes/blueprint/generate-blueprints.ts'
import { reviseBlueprint } from '../nodes/blueprint/revise-blueprint.ts'
import { assembleBook, consistencyCheck, finalConfirmation, formatOutput, globalRevision } from '../nodes/book/assembly.ts'
import { finalizeChapter } from '../nodes/chapter/finalize-chapter.ts'
import { generateExercises, reviewExercises } from '../nodes/chapter/generate-exercises.ts'
import { planAndRewrite } from '../nodes/chapter/plan-and-rewrite.ts'
import { planChapter } from '../nodes/chapter/plan-chapter.ts'
import { research } from '../nodes/chapter/research.ts'
import { reviewAll } from '../nodes/chapter/review-all.ts'
import { selectNextChapter } from '../nodes/chapter/select-chapter.ts'
import { synthesizeDraft, writeDraftVariants } from '../nodes/chapter/write-draft-variants.ts'
import { askClarification, generateQuestions } from '../nodes/requirements/ask-clarification.ts'
import { checkSufficiency } from '../nodes/requirements/check-sufficiency.ts'
import { fillDefaults } from '../nodes/requirements/fill-defaults.ts'
import { generateProjectDef } from '../nodes/requirements/generate-project-def.ts'
import { parseInput } from '../nodes/requirements/parse-input.ts'
import { confirmSampleChapter } from '../nodes/sample/confirm-sample.ts'
import { selectSampleChapter } from '../nodes/sample/select-sample-chapter.ts'
import { TextbookState } from '../types/index.ts'
import { FileCheckpointSaver } from '../utils/checkpointer.ts'
import { NODES as N } from './nodes.ts'
import {
  blueprintConfirmRouter,
  blueprintCritiqueRouter,
  chapterLoopRouter,
  chapterQualityRouter,
  globalRevisionRouter,
  nextChapterRouter,
  researchRouter,
  sampleConfirmRouter,
  sufficiencyRouter,
} from './routers.ts'

const n = Object.fromEntries(Object.keys(N).map(k => [k, k])) as { [K in keyof typeof N]: K }

export function buildMainGraph () {
  const graph = new StateGraph(TextbookState)
    // Phase 1: Requirements
    .addNode(n.parse_input, parseInput)
    .addNode(n.check_sufficiency, checkSufficiency)
    .addNode(n.generate_questions, generateQuestions)
    .addNode(n.ask_clarification, askClarification)
    .addNode(n.fill_defaults, fillDefaults)
    .addNode(n.generate_project_def, generateProjectDef)

    // Phase 2: Blueprint
    .addNode(n.generate_blueprints, generateBlueprints)
    .addNode(n.compare_and_merge, compareAndMerge)
    .addNode(n.critique_blueprint, critiqueBlueprint)
    .addNode(n.revise_blueprint, reviseBlueprint)
    .addNode(n.confirm_blueprint, confirmBlueprint)

    // Phase 3: Sample Chapter
    .addNode(n.select_sample_chapter, selectSampleChapter)
    .addNode(n.sample_plan_chapter, planChapter)
    .addNode(n.sample_write_variants, writeDraftVariants)
    .addNode(n.sample_synthesize, synthesizeDraft)
    .addNode(n.confirm_sample, confirmSampleChapter)

    // Phase 4: Chapter Production
    .addNode(n.select_next_chapter, selectNextChapter)
    .addNode(n.ch_plan_chapter, planChapter)
    .addNode(n.ch_research, research)
    .addNode(n.ch_write_variants, writeDraftVariants)
    .addNode(n.ch_synthesize, synthesizeDraft)
    .addNode(n.ch_review_all, reviewAll)
    .addNode(n.ch_plan_and_rewrite, planAndRewrite)
    .addNode(n.ch_generate_exercises, generateExercises)
    .addNode(n.ch_review_exercises, reviewExercises)
    .addNode(n.ch_finalize, finalizeChapter)

    // Phase 5: Book Assembly
    .addNode(n.assemble_book, assembleBook)
    .addNode(n.consistency_check, consistencyCheck)
    .addNode(n.global_revision, globalRevision)
    .addNode(n.format_output, formatOutput)
    .addNode(n.final_confirmation, finalConfirmation)

    // Phase 1 edges
    .addEdge(START, n.parse_input)
    .addEdge(n.parse_input, n.check_sufficiency)
    .addConditionalEdges(n.check_sufficiency, sufficiencyRouter, {
      fill_defaults: n.fill_defaults,
      generate_questions: n.generate_questions,
    })
    .addEdge(n.generate_questions, n.ask_clarification)
    .addEdge(n.ask_clarification, n.check_sufficiency)
    .addEdge(n.fill_defaults, n.generate_project_def)

    // Phase 2 edges
    .addEdge(n.generate_project_def, n.generate_blueprints)
    .addEdge(n.generate_blueprints, n.compare_and_merge)
    .addEdge(n.compare_and_merge, n.critique_blueprint)
    .addConditionalEdges(n.critique_blueprint, blueprintCritiqueRouter, {
      confirm_blueprint: n.confirm_blueprint,
      revise_blueprint: n.revise_blueprint,
    })
    .addEdge(n.revise_blueprint, n.critique_blueprint)
    .addConditionalEdges(n.confirm_blueprint, blueprintConfirmRouter, {
      select_sample_chapter: n.select_sample_chapter,
      revise_blueprint: n.revise_blueprint,
    })

    // Phase 3 edges
    .addEdge(n.select_sample_chapter, n.sample_plan_chapter)
    .addEdge(n.sample_plan_chapter, n.sample_write_variants)
    .addEdge(n.sample_write_variants, n.sample_synthesize)
    .addEdge(n.sample_synthesize, n.confirm_sample)
    .addConditionalEdges(n.confirm_sample, sampleConfirmRouter, {
      select_next_chapter: n.select_next_chapter,
      sample_write_variants: n.sample_write_variants,
      assemble_book: n.assemble_book,
    })

    // Phase 4 edges
    .addConditionalEdges(n.select_next_chapter, nextChapterRouter, {
      ch_plan_chapter: n.ch_plan_chapter,
      assemble_book: n.assemble_book,
    })
    .addConditionalEdges(n.ch_plan_chapter, researchRouter, {
      ch_research: n.ch_research,
      ch_write_variants: n.ch_write_variants,
    })
    .addEdge(n.ch_research, n.ch_write_variants)
    .addEdge(n.ch_write_variants, n.ch_synthesize)
    .addEdge(n.ch_synthesize, n.ch_review_all)
    .addConditionalEdges(n.ch_review_all, chapterQualityRouter, {
      ch_generate_exercises: n.ch_generate_exercises,
      ch_plan_and_rewrite: n.ch_plan_and_rewrite,
      ch_finalize: n.ch_finalize,
    })
    .addEdge(n.ch_plan_and_rewrite, n.ch_review_all)
    .addEdge(n.ch_generate_exercises, n.ch_review_exercises)
    .addEdge(n.ch_review_exercises, n.ch_finalize)
    .addConditionalEdges(n.ch_finalize, chapterLoopRouter, {
      select_next_chapter: n.select_next_chapter,
      assemble_book: n.assemble_book,
    })

    // Phase 5 edges
    .addEdge(n.assemble_book, n.consistency_check)
    .addEdge(n.consistency_check, n.global_revision)
    .addConditionalEdges(n.global_revision, globalRevisionRouter, {
      global_revision: n.global_revision,
      format_output: n.format_output,
    })
    .addEdge(n.format_output, n.final_confirmation)
    .addEdge(n.final_confirmation, END)

  return graph
}

export function compileMainGraph () {
  const graph = buildMainGraph()
  const checkpointer = new FileCheckpointSaver()
  return graph.compile({ checkpointer })
}
