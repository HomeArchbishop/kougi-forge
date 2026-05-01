import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

import type { TextbookProject } from '../types/index.ts'
import { buildOutputDir } from './context-builder.ts'

export async function ensureOutputDir (project: TextbookProject): Promise<string> {
  const dir = buildOutputDir(project)
  mkdirSync(`${dir}/chapters`, { recursive: true })
  await writeFile(`${dir}/chapters/.gitkeep`, '')
  return dir
}

export async function writeChapter (outputDir: string, chapterId: string, content: string): Promise<string> {
  const path = `${outputDir}/chapters/${chapterId}.md`
  await writeFile(path, content, 'utf8')
  return path
}

export async function writeBook (outputDir: string, filename: string, content: string): Promise<string> {
  const path = `${outputDir}/${filename}`
  await writeFile(path, content, 'utf8')
  return path
}
