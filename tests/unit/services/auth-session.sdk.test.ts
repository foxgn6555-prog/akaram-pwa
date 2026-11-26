/** اكتمال عقد الدخول والجلسة: تطبيع البريد، حفظ الجلسة، الأدوار، الأخطاء الآمنة، وإلغاء المستمع. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string; code?: string } } }
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = []
  const chain = (table: string) => {
    const calls: Array<[string, unknown[]]> = []
    queries.push({ table, calls })
    const c: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'maybeSingle']) c[method] = vi.fn((...args: unknown[]) => { calls.push([method, args]); return c })
    c.then = (resolve: (v: typeof state.result) => unknown) => Promise.resolve(state.result).then(resolve)
    return c
  }
  return {
    state, queries, from: vi.fn(chain),
    invoke: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
    setSession: vi.fn(async (..._args: unknown[]): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: null | { message: string } }> => ({ data: { user: { id: 'u1', email: 'x@y.test' } }, error: null })),
    getSession: vi.fn(async (): Promise<{ data: { session: { access_token: string; user: { id: string; email?: string | null } } | null } }> => ({ data: { session: null } })),
    signOut: vi.fn(async () => ({ error: null as null | { message: string } })),
    onAuthStateChange: vi.fn((_cb: (event: string, session: { access_token: string } | null) => void) => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    buildSessionUser: vi.fn(async (id: string, email: string | null) => ({ id, email, fullName: 'علي', roles: ['employee'], primaryRole: 'employee' })),
    guard: vi.fn(async (value: PromiseLike<{ data: unknown; error: null | { message: string; code?: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data }),
    /** يقابل sdkMaybe الحقيقي: يسمح بـ null ويُبقي فحص الأخطاء (بخلاف sdkGuard) */
    maybe: vi.fn(async (value: PromiseLike<{ data: unknown; error: null | { message: string; code?: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data }),
    voidGuard: vi.fn(async (value: PromiseLike<{ error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message) }),
  }
})
vi.mock('@sdk/client', () => ({ supabase: { functions: { invoke: h.invoke }, auth: { setSession: h.setSession, getSession: h.getSession, signOut: h.signOut, onAuthStateChange: h.onAuthStateChange }, from: h.from }, sdkGuard: h.guard, sdkMaybe: h.maybe, sdkVoid: h.voidGuard }))
import { auth, LoginGatewayError } from '@sdk/auth.sdk'
import { ROLE_PRIORITY } from '@lib/constants/roles.constants'

const tokens = { access_token: 'access-test', refresh_token: 'refresh-test' }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  h.state.result = { data: [], error: null }; h.queries.length = 0
  h.invoke.mockResolvedValue({ data: { session: tokens }, error: null })
  h.setSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@y.test' } }, error: null })
  h.getSession.mockResolvedValue({ data: { session: null } })
  h.signOut.mockResolvedValue({ error: null })
  h.buildSessionUser.mockResolvedValue({ id: 'u1', email: 'x@y.test', fullName: 'علي', roles: ['employee'], primaryRole: 'employee' })
  h.guard.mockImplementation(async (value) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data })
  h.maybe.mockImplementation(async (value) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data })
  h.voidGuard.mockImplementation(async (value) => { const r = await value; if (r.error) throw new Error(r.error.message) })
})

describe('auth.login — البوابة الآمنة', () => {
  it('ينشئ جلسة فقط بعد رمزي الخادم، ويمرر البريد المطبع ولا يعيد كلمة المرور في الخطأ', async () => {
    const build = vi.spyOn(auth, 'buildSessionUser').mockResolvedValue({ id: 'u1', email: 'x@y.test', fullName: 'علي', roles: ['employee'], primaryRole: 'employee' })
    expect(await auth.login(' X@Y.TEST ', 'secret-value')).toMatchObject({ id: 'u1', fullName: 'علي' })
    expect(h.invoke).toHaveBeenCalledWith('staff-login', { body: { email: 'x@y.test', password: 'secret-value', source_id: expect.any(String) } })
    expect(h.setSession).toHaveBeenCalledWith(tokens)
    expect(build).toHaveBeenCalledWith('u1', 'x@y.test')
    build.mockRestore()
  })
  it.each([
    ['AUTH_THROTTLED', 'الخدمة قيّدت'],
    ['LOGIN_GUARD_UNAVAILABLE', 'تعذر التحقق الآمن'],
    ['CONFIGURATION', 'تعذر التحقق الآمن'],
    ['INVALID_INPUT', 'تحقق من البريد'],
    ['UNKNOWN', 'تعذر الاتصال بخدمة الدخول'],
  ])('يترجم %s إلى خطأ منظم بلا تسريب الاستجابة الخام', async (code, message) => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'raw', context: new Response(JSON.stringify({ error: code })) } })
    const error = await auth.login('x@y.test', 'secret-value').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LoginGatewayError)
    expect((error as Error).message).toContain(message)
    expect((error as Error).message).not.toContain('secret-value')
    expect(h.setSession).not.toHaveBeenCalled()
  })
  it('الرد غير JSON أو بلا جلسة أو ناقص refresh يتحول إلى AUTH_NETWORK ولا يحفظ جلسة', async () => {
    for (const error of [{ message: 'network' }, { context: new Response('not-json') }, { context: { clone: () => ({ json: async () => { throw new Error('bad json') } }) } }]) {
      h.invoke.mockResolvedValueOnce({ data: { session: tokens }, error })
      await expect(auth.login('x@y.test', 'p')).rejects.toMatchObject({ code: 'AUTH_NETWORK' })
    }
    h.invoke.mockResolvedValueOnce({ data: {}, error: null })
    await expect(auth.login('x@y.test', 'p')).rejects.toMatchObject({ code: 'AUTH_NETWORK' })
    h.invoke.mockRejectedValueOnce(new Error('raw secret request'))
    await expect(auth.login('x@y.test', 'p')).rejects.toMatchObject({ code: 'AUTH_NETWORK' })
    expect(h.setSession).not.toHaveBeenCalled()
  })
  it('فشل حفظ الجلسة أو نقص رمز الوصول يفشل بأمان', async () => {
    h.setSession.mockResolvedValueOnce({ data: { user: null }, error: null })
    await expect(auth.login('x@y.test', 'p')).rejects.toMatchObject({ code: 'AUTH_SESSION_FAILED' })
    h.setSession.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: { message: 'session failed' } })
    await expect(auth.login('x@y.test', 'p')).rejects.toMatchObject({ code: 'AUTH_SESSION_FAILED' })
    h.invoke.mockResolvedValueOnce({ data: { session: { access_token: 'a' } }, error: null })
    await expect(auth.login('x@y.test', 'p')).rejects.toMatchObject({ code: 'AUTH_NETWORK' })
    expect(h.setSession).toHaveBeenCalledTimes(2)
  })
})

describe('auth — الجلسة والأدوار', () => {
  it('getSession وgetAccessToken يعيدان null بلا مستخدم، ويبنيان المستخدم عند وجود جلسة', async () => {
    const build = vi.spyOn(auth, 'buildSessionUser').mockResolvedValue({ id: 'u1', email: null, fullName: null, roles: [], primaryRole: 'employee' })
    expect(await auth.getSession()).toBeNull()
    expect(await auth.getAccessToken()).toBeNull()
    expect(build).not.toHaveBeenCalled()
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'a', user: { id: 'u1' } } } })
    expect(await auth.getAccessToken()).toBe('a')
    expect(await auth.getSession()).toMatchObject({ id: 'u1', email: null })
    expect(build).toHaveBeenCalledWith('u1', null)
    build.mockRestore()
  })
  it('مستمع الحالة يمرر الرمز أو null، ودالة الإلغاء تلغي الاشتراك مرة واحدة', () => {
    const unsubscribe = vi.fn()
    h.onAuthStateChange.mockReturnValueOnce({ data: { subscription: { unsubscribe } } })
    const callback = vi.fn()
    const dispose = auth.onAuthStateChange(callback)
    const listener = h.onAuthStateChange.mock.calls[0]![0]
    listener('SIGNED_IN', { access_token: 'a' })
    listener('SIGNED_OUT', null)
    expect(callback).toHaveBeenNthCalledWith(1, 'a')
    expect(callback).toHaveBeenNthCalledWith(2, null)
    dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('buildSessionUser يقرأ أدوار المستخدم نفسه ويختار الدور حسب الأولوية لا ترتيب الصفوف', async () => {
    h.guard.mockResolvedValueOnce([{ role: 'employee' }, { role: 'it_admin' }])
    h.maybe.mockResolvedValueOnce({ full_name: 'علي' })
    expect(await auth.buildSessionUser('u1', 'x@y.test')).toEqual({ id: 'u1', email: 'x@y.test', fullName: 'علي', roles: ['employee', 'it_admin'], primaryRole: ROLE_PRIORITY.find((r) => ['employee', 'it_admin'].includes(r)) })
    expect(h.from.mock.calls.map(([table]) => table)).toEqual(['user_roles', 'employees'])
    expect(h.queries[0]!.calls).toContainEqual(['eq', ['user_id', 'u1']])
    expect(h.queries[1]!.calls).toContainEqual(['eq', ['user_id', 'u1']])
    h.guard.mockResolvedValueOnce([])
    h.maybe.mockResolvedValueOnce(null)
    expect(await auth.buildSessionUser('u2', null)).toMatchObject({ fullName: null, roles: [], primaryRole: 'employee' })
    h.guard.mockRejectedValueOnce(new Error('ROLES_DENIED'))
    await expect(auth.buildSessionUser('u2', null)).rejects.toThrow('ROLES_DENIED')
  })
  it('logout ينتظر حارس الأخطاء ولا يبتلع فشل تسجيل الخروج', async () => {
    await auth.logout()
    expect(h.signOut).toHaveBeenCalledOnce()
    h.signOut.mockResolvedValueOnce({ error: { message: 'LOGOUT_FAILED' } })
    await expect(auth.logout()).rejects.toThrow('LOGOUT_FAILED')
  })
})
