/** 00275 — فهرس أدلة التشغيل التقني (تُضاف أدلة الجولات التالية هنا) */
import type { Guide } from './types'
import { gitGuide } from './content/git'
export type { Guide, GuideCommand, GuideSection } from './types'
export const GUIDES: readonly Guide[] = [gitGuide]
export const findGuide = (slug: string | undefined) => GUIDES.find((g) => g.slug === slug)
