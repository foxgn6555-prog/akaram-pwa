/** SDK البوابات الديناميكية (00024) */
import { sdkGuard, sdkVoid, supabase } from './client'
import type { DynamicPortal, PortalUnit, CreatePortalInput, AddUnitInput } from '@features/portals/types'

export const portals = {
  async list(): Promise<DynamicPortal[]> {
    return sdkGuard(
      supabase
        .from('dynamic_portals')
        .select('id, slug, name, description, icon, color, is_active')
        .order('name'),
    ) as Promise<DynamicPortal[]>
  },

  async listUnits(portalId?: string): Promise<PortalUnit[]> {
    let query = supabase
      .from('portal_units')
      .select('id, portal_id, unit_key, label, icon, page_keys, sort_order')
      .order('sort_order')
    if (portalId) query = query.eq('portal_id', portalId)
    return sdkGuard(query) as Promise<PortalUnit[]>
  },

  async create(input: CreatePortalInput): Promise<DynamicPortal> {
    return sdkGuard(
      supabase
        .from('dynamic_portals')
        .insert({
          slug: input.slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
          name: input.name,
          icon: input.icon ?? 'layout-grid',
          color: input.color ?? '#005f8d',
          description: input.description ?? null,
        } as never)
        .select('id, slug, name, description, icon, color, is_active')
        .single(),
    ) as Promise<DynamicPortal>
  },

  async setActive(id: string, is_active: boolean): Promise<void> {
    await sdkVoid(
      supabase.from('dynamic_portals').update({ is_active } as never).eq('id', id),
    )
  },

  async addUnit(input: AddUnitInput): Promise<void> {
    await sdkVoid(
      supabase.from('portal_units').insert({
        portal_id: input.portal_id,
        unit_key: input.unit_key,
        label: input.label,
        icon: input.icon ?? 'folder',
        page_keys: input.page_keys ?? [],
        sort_order: input.sort_order ?? 0,
      } as never),
    )
  },

  async removeUnit(unitId: string): Promise<void> {
    await sdkVoid(supabase.from('portal_units').delete().eq('id', unitId))
  },
}
