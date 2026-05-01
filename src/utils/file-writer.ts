import type { TextbookProject } from '../types/index.ts'
import { buildOutputDir } from './context-builder.ts'

export async function ensureOutputDir (project: TextbookProject): Promise<string> {
  const dir = buildOutputDir(project)
  await Bun.write(`${dir}/chapters/.gitkeep`, '')
  return dir
}

export async function writeChapter (outputDir: string, chapterId: string, content: string): Promise<string> {
  const path = `${outputDir}/chapters/${chapterId}.md`
  await Bun.write(path, content)
  return path
}

export async function writeBook (outputDir: string, filename: string, content: string): Promise<string> {
  const path = `${outputDir}/${filename}`
  await Bun.write(path, content)
  return path
}
