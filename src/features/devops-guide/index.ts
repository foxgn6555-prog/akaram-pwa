/** 00275 — فهرس أدلة التشغيل التقني (تُضاف أدلة الجولات التالية هنا) */
import type { Guide } from './types'
import { gitGuide } from './content/git'
import { databaseGuide } from './content/database'
import { testsGuide } from './content/tests'
export type { Guide, GuideCommand, GuideSection } from './types'
export const GUIDES: readonly Guide[] = [gitGuide, databaseGuide, testsGuide]
export const findGuide = (slug: string | undefined) => GUIDES.find((g) => g.slug === slug)
