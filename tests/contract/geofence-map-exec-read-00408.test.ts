/**
 * 00408 — حدود القواطع: قراءة للمدير المفوض والمعاون
 * عيب مكتشَف بالفحص الحيّ (④-58): gps_lvn_map_geofences كانت ترفض الدورين بـGPS_FORBIDDEN
 * رغم أن صفحة «بقع التوقف» مفتوحة لهما في الواجهة.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/00408_geofence_map_exec_read.sql'), 'utf8')
const body = sql.replace(/--[^\n]*/g, '')   // تجاهل التعليقات

describe('00408 — حدود القواطع للمدير المفوض والمعاون', () => {
  it('يسمح للدورين المطلوبين مع بقاء الأدوار السابقة', () => {
    for (const role of ['ops_room', 'it_admin', 'super_admin', 'executive_director', 'deputy_director']) {
      expect(body).toContain(`'${role}'`)
    }
  })

  it('الدالة قراءة فقط — لا إدراج/تعديل/حذف', () => {
    expect(body).not.toMatch(/\binsert\s+into\b/i)
    expect(body).not.toMatch(/\bupdate\s+public\./i)
    expect(body).not.toMatch(/\bdelete\s+from\b/i)
    expect(body).toMatch(/stable/i)
    expect(body).toMatch(/security\s+definer/i)
    expect(body).toMatch(/set\s+search_path\s*=\s*public\s*,\s*app/i)
  })

  it('لا يغيّر إلا دالة واحدة ولا يمسّ دوال الكتابة أو RLS', () => {
    const replaced = [...body.matchAll(/create\s+or\s+replace\s+function\s+([a-z0-9_.]+)/gi)].map((m) => m[1])
    expect(replaced).toEqual(['public.gps_lvn_map_geofences'])
    expect(body).not.toMatch(/drop\s+function/i)
    expect(body).not.toMatch(/policy/i)
    expect(body).not.toMatch(/alter\s+table/i)
  })

  it('يحافظ على شكل المخرجات نفسه (٨ أعمدة)', () => {
    for (const col of ['id uuid', 'name text', 'source text', 'color text', 'polygon jsonb', 'sector_id smallint', 'area_name text', 'parent_sector text']) {
      expect(body).toContain(col)
    }
  })

  it('الحارس ما زال يرفض من لا دور له', () => {
    expect(body).toMatch(/auth\.uid\(\)\s*is\s*null/i)
    expect(body).toMatch(/raise\s+exception\s*'GPS_FORBIDDEN'/i)
  })
})
