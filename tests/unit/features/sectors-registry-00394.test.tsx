/**
 * 00394 — السجل الحيّ للقطاعات: التسميات والقوائم تقرأ من قاعدة البيانات؛ قطاع جديد مضاف من التطوير المركزية
 *   يظهر فوراً في: تسميات الشكاوى/الكراج/الإعلام/مسؤول القاطع، مناطق GBS والمحلات، وقوائم القطاعات (useParentSectors).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { PARENT_SECTOR_LABELS_LIVE, areaLabel, parentCodesOf, parentSectorLabel, parentSectorTitle, registerSectorsTree, resetSectorsRegistry } from '@sdk/sectors.sdk'
import { useParentSectors } from '@features/sectors'
import { GBS_PARENT_LABELS, GBS_SECTOR_OPTIONS } from '@features/gbs/sectorOptions'
import { COMPLAINT_AREAS, areaName } from '@features/complaints/lib/neighborhoods'
import { PARENT_AR } from '@features/contractors/format'
import { SECTOR_LABEL } from '@features/media/constants'
import { label as execLabel } from '@features/executive/lib/labels'

const tree = [
  { code: 'karrada', name: 'الكرادة', sort: 1, is_active: true, areas: [{ id: 1, code: 'S1', name: 'أرخيته', sort: 1, is_active: true }, { id: 2, code: 'S2', name: 'الرياض', sort: 2, is_active: false }] },
  { code: 'dora', name: 'الدورة', sort: 3, is_active: true, areas: [{ id: 9, code: 'S9', name: 'حي الميكانيك', sort: 1, is_active: true }] },
  { code: 'old', name: 'قطاع موقوف', sort: 4, is_active: false, areas: [{ id: 10, code: 'S10', name: 'قديمة', sort: 1, is_active: true }] },
]
afterEach(() => resetSectorsRegistry())

describe('السجل الحيّ للقطاعات (00394)', () => {
  it('قبل التحميل: القيم المعروفة (الكرادة/الزعفرانية + المناطق الثماني)', () => {
    expect(parentSectorLabel('karrada')).toBe('الكرادة'); expect(parentSectorTitle('zaafaraniya')).toBe('قاطع الزعفرانية')
    expect(areaLabel(6)).toBe('الزعفرانية'); expect(GBS_SECTOR_OPTIONS.length).toBe(8); expect(COMPLAINT_AREAS.filter((a) => a.parent === 'karrada').length).toBe(4)
    expect(parentSectorLabel('ghost')).toBe('ghost'); expect(parentSectorLabel(null)).toBe('—')
  })
  it('بعد التسجيل: قطاع «الدورة» الجديد يظهر في كل التسميات والقوائم، والموقوف يبقى له اسمه لكنه يختفي من القوائم', () => {
    registerSectorsTree(tree)
    expect(parentSectorLabel('dora')).toBe('الدورة'); expect(PARENT_SECTOR_LABELS_LIVE.dora).toBe('الدورة'); expect(Object.keys(PARENT_SECTOR_LABELS_LIVE)).toContain('dora')
    expect(PARENT_AR.dora).toBe('قاطع الدورة'); expect(SECTOR_LABEL.dora).toBe('قاطع الدورة'); expect(GBS_PARENT_LABELS.dora).toBe('قاطع الدورة'); expect(execLabel('dora')).toBe('الدورة')
    expect(parentSectorLabel('old')).toBe('قطاع موقوف')
    expect(GBS_SECTOR_OPTIONS.map((o) => o.id)).toEqual([1, 9])          // المنطقة الموقوفة 2 والقطاع الموقوف 10 لا يظهران
    expect(COMPLAINT_AREAS.map((a) => a.id)).toEqual([1, 9]); expect(areaName(9)).toBe('حي الميكانيك'); expect(areaName(2)).toBe('الرياض')
    expect(parentCodesOf([{ parentSector: 'dora' }, { parentSector: 'karrada' }, { parentSector: 'zzz' }])).toEqual(['karrada', 'dora', 'zzz'])
  })
  it('useParentSectors يتفاعل مع التسجيل بلا QueryClient', () => {
    const { result } = renderHook(() => useParentSectors())
    expect(result.current.parents.map((p) => p.code)).toEqual(['karrada', 'zaafaraniya'])
    act(() => registerSectorsTree(tree))
    expect(result.current.parents.map((p) => p.code)).toEqual(['karrada', 'dora'])
    expect(result.current.parents[1]?.title).toBe('قاطع الدورة')
    expect(result.current.areas.map((a) => a.id)).toEqual([1, 9])
    expect(result.current.isLoaded).toBe(true)
  })
})
