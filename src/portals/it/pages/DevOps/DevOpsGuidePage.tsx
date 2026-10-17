/** 00275 — صفحة دليل واحد بحسب slug */
import { Navigate, useParams } from 'react-router'
import { findGuide } from '@features/devops-guide'
import { GuideRenderer } from '@features/devops-guide/GuideRenderer'

export default function DevOpsGuidePage() {
  const { slug } = useParams()
  const guide = findGuide(slug)
  if (!guide) return <Navigate to="/it/devops" replace />
  return <GuideRenderer guide={guide} />
}
