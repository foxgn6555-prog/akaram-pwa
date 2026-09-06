import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ComplaintDeletionQueue } from '@portals/it/pages/Archive/ComplaintDeletionQueue'
import type { ComplaintArchiveFolder, ComplaintDeletionRequest } from '@features/complaints/types'

const folder = { id: 'folder-1', subject: 'شكوى شارع 20' } as ComplaintArchiveFolder
const base = { id: 'request-1', folderId: 'folder-1', reason: 'انتهاء الغرض القانوني', requestedAt: '2026-09-06', decidedAt: null, decisionNote: null, executionStartedAt: null } as ComplaintDeletionRequest

describe('قائمة الحذف النهائي في بوابة التطوير', () => {
  it('يعرض فشل Storage وعدد المحاولات ويتيح إعادة محاولة موقعة لمدير النظام', () => {
    const retry = vi.fn()
    render(<ComplaintDeletionQueue requests={[{ ...base, status: 'failed', attemptCount: 2, errorMessage: 'STORAGE_TEMPORARY_FAILURE' }]} folders={[folder]} isSuperAdmin onDecide={vi.fn()} onRetry={retry} />)
    expect(screen.getByText('فشل التنفيذ')).toBeInTheDocument()
    expect(screen.getByText('عدد محاولات التنفيذ: 2')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('STORAGE_TEMPORARY_FAILURE')
    fireEvent.click(screen.getByRole('button', { name: 'توقيع وإعادة محاولة الحذف' }))
    expect(retry).toHaveBeenCalledWith('request-1')
  })

  it('لا يسمح لمسؤول IT غير مدير النظام بإعادة المحاولة', () => {
    render(<ComplaintDeletionQueue requests={[{ ...base, status: 'failed', attemptCount: 1, errorMessage: null }]} folders={[folder]} isSuperAdmin={false} onDecide={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'توقيع وإعادة محاولة الحذف' })).toBeNull()
    expect(screen.getByText('إعادة المحاولة محصورة بمدير النظام.')).toBeInTheDocument()
  })

  it('يفصل القرار الأول عن التنفيذ ويعرض الحالات النشطة فقط', () => {
    const decide = vi.fn()
    render(<ComplaintDeletionQueue requests={[
      { ...base, status: 'pending', attemptCount: 0, errorMessage: null },
      { ...base, id: 'done', status: 'executed', attemptCount: 1, errorMessage: null },
    ]} folders={[folder]} isSuperAdmin onDecide={decide} onRetry={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'توقيع وموافقة' }))
    expect(decide).toHaveBeenCalledWith('request-1', true)
    expect(screen.getByText('بانتظار القرار: 1')).toBeInTheDocument()
    expect(screen.queryByText('نُفّذ')).toBeNull()
  })
})
