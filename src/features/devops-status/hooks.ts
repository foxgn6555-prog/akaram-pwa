/** 00278 — لوحة الحالة الحية */
import { useQuery } from '@tanstack/react-query'
import { devops } from '@sdk/devops.sdk'

const ROOT = ['devops-status']
export const useDevOpsStatus = (refreshMs = 30_000) =>
  useQuery({ queryKey: [...ROOT, 'status'], queryFn: () => devops.status(), refetchInterval: refreshMs, retry: 1 })
export const useEdgeHealth = (refreshMs = 60_000) =>
  useQuery({ queryKey: [...ROOT, 'edge'], queryFn: () => devops.edgeHealth(), refetchInterval: refreshMs, retry: 0 })
