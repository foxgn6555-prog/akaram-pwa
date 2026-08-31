/**
 * مزامنة بوابات المنظومة الحقيقية إلى مصمم التدفقات:
 *  ① يقرأ البوابات الديناميكية النشطة (00024) ويبني الكتالوج (الثابت الـ13 + الخارجي + الديناميكي)
 *  ② يدمجه غير مدمّر مع الكتالوج الحالي ويحفظه (flowbridge_state.portals)
 *  ③ يبني مخطط المنظومة (عقد + تدفقات حقيقية) ويدمجه مع المخطط الحالي (flowbridge_state.graph)
 *  ④ ينشئ روابط الأحداث الافتراضية الناقصة (flowbridge_event_bindings) — مرة واحدة فقط
 *  ⑤ يدمج فئات المنظومة في settings.categories
 * كل خطوة عبر RLS (it_admin/super_admin) — لا service_role ولا بيانات وهمية.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { flowbridgeKeys } from '@lib/query-keys/flowbridge.keys'
import { flowbridge } from '@sdk/flowbridge.sdk'
import { portals as portalsSdk } from '@sdk/portals.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import {
  buildSystemCatalog,
  buildSystemGraph,
  mergeCatalog,
  mergeCategories,
  mergeGraph,
  missingBindings,
  systemDefaultBindings,
} from '../lib/systemPortals'

export interface FlowBridgeSyncSummary {
  portals: number
  nodes: number
  flows: number
  bindingsCreated: number
}

export function useSyncFlowbridgeSystem() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: async (): Promise<FlowBridgeSyncSummary> => {
      // ① الكتالوج من مصادر الحقيقة
      const dynamics = await portalsSdk.list()
      const systemCatalog = buildSystemCatalog(dynamics)

      // ② دمج الكتالوج مع الحالي (ما ينشئه المستخدم يبقى) ثم الحفظ
      const existingPortals = (await flowbridge.getState('portals'))?.value ?? []
      const mergedPortals = mergeCatalog(existingPortals, systemCatalog)
      await flowbridge.setState('portals', mergedPortals)

      // ③ مخطط المنظومة مدمجاً مع مخطط المستخدم (مواضعه محفوظة)
      const existingGraph = (await flowbridge.getState('graph'))?.value
      const systemGraph = buildSystemGraph(mergedPortals)
      const mergedGraph = mergeGraph(existingGraph, systemGraph)
      await flowbridge.setState('graph', mergedGraph)

      // ④ روابط الأحداث الافتراضية الناقصة فقط (idempotent)
      const existingBindings = await flowbridge.listBindings()
      const todo = missingBindings(existingBindings, systemDefaultBindings())
      for (const binding of todo) await flowbridge.createBinding(binding)

      // ⑤ فئات المنظومة في الإعدادات (تظهر في صفحة البوابات داخل المصمم)
      const existingSettings = (await flowbridge.getState('settings'))?.value
      const mergedCategories = mergeCategories(existingSettings?.categories)
      if (mergedCategories.length !== (existingSettings?.categories?.length ?? 0)) {
        await flowbridge.setState('settings', { ...(existingSettings ?? { autosave: true, apiUrl: '', apiToken: '', categories: [] }), categories: mergedCategories })
      }

      return {
        portals: mergedPortals.length,
        nodes: mergedGraph.nodes.length,
        flows: mergedGraph.flows.length,
        bindingsCreated: todo.length,
      }
    },
    onSuccess: (summary) => {
      void queryClient.invalidateQueries({ queryKey: flowbridgeKeys.all })
      addToast({
        type: 'success',
        message: `تمت المزامنة: ${summary.portals} بوابة · ${summary.nodes} عقدة · ${summary.flows} تدفق${summary.bindingsCreated > 0 ? ` · ${summary.bindingsCreated} ربط حدث جديد` : ''}`,
      })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'flowbridge.sync' }).message })
    },
  })
}