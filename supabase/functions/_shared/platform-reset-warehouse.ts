/** تنسيق مسح مستودع GPS لطلب منفَّذ فقط؛ عمليات الشبكة تُحقن لتسهيل اختبار حالات الفشل. */
export interface WarehouseResetDeps {
  claim: (id: string) => Promise<{ done: boolean; token?: string; wipe_data?: boolean; reset_settings?: boolean; result?: Record<string, unknown> }>
  finish: (id: string, token: string, ok: boolean, result: Record<string, unknown> | null) => Promise<void>
  prepare: (id: string, wipeData: boolean, resetSettings: boolean) => Promise<{ state: string; result?: Record<string, unknown> }>
  files: (id: string) => Promise<Array<{ name: string }>>
  remove: (names: string[]) => Promise<number>
  execute: (id: string) => Promise<Record<string, unknown>>
  now: () => number
}
export async function runWarehouseReset(actor: { id: string | null; roles: string[]; scheduler: boolean }, id: string | undefined, d: WarehouseResetDeps) {
  if (!actor.id || actor.scheduler) throw new Error('GPS_WAREHOUSE_RESET_FORBIDDEN')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('GPS_WAREHOUSE_RESET_ID_REQUIRED')
  const claim = await d.claim(id)
  if (claim.done) return claim.result ?? {}
  if (!claim.token) throw new Error('GPS_WAREHOUSE_RESET_NOT_AUTHORIZED')
  const token = claim.token
  try {
    const prep = await d.prepare(id, claim.wipe_data === true, claim.reset_settings === true)
    if (prep.state === 'waiting') throw new Error('GPS_WAREHOUSE_RESET_WAITING_FOR_PULL')
    let result: Record<string, unknown>
    if (prep.state === 'done') result = prep.result ?? {}
    else if (prep.state === 'prepared') {
      const deadline = d.now() + 65_000
      let finished = false
      for (let guard = 0; guard < 150 && d.now() < deadline; guard++) {
        const files = await d.files(id)
        if (!files.length) { finished = true; break }
        if (await d.remove(files.map((f) => f.name)) < files.length) throw new Error('GPS_WAREHOUSE_RESET_STORAGE_INCOMPLETE')
      }
      if (!finished) throw new Error('GPS_WAREHOUSE_RESET_RETRY_REQUIRED')
      result = await d.execute(id)
    } else throw new Error('GPS_WAREHOUSE_RESET_BAD_STATE')
    await d.finish(id, token, true, result)
    return result
  } catch (e) {
    await d.finish(id, token, false, null).catch(() => undefined)
    throw e
  }
}
