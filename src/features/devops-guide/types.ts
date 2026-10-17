/** 00275 — دليل التشغيل التقني (التطوير المركزية): بنية المحتوى */
export type Danger = 'safe' | 'care' | 'danger'
export interface GuideCommand {
  /** الأمر كما يُكتب في الطرفية */
  cmd: string
  /** ماذا يفعل — جملة بسيطة */
  what: string
  /** متى أستخدمه */
  when: string
  /** مثال حقيقي من مشروعنا */
  example: string
  /** ماذا أفعل إن فشل / ما الذي أراه عند النجاح */
  ifFails: string
  danger?: Danger
  /** أين يُنفَّذ (افتراضي: مجلد المشروع C:\fox) */
  where?: string
}
export interface GuideStep { title: string; body: string; cmd?: string }
export interface GuideFaq { q: string; a: string }
export interface GuideConcept { term: string; meaning: string; example: string }
export interface GuideSection {
  id: string
  title: string
  intro?: string
  concepts?: GuideConcept[]
  steps?: GuideStep[]
  commands?: GuideCommand[]
  faq?: GuideFaq[]
}
export interface Guide {
  slug: string
  title: string
  subtitle: string
  /** تنبيه ثابت أعلى الصفحة */
  notice?: string
  sections: GuideSection[]
}
