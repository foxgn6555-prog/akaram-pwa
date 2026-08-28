/** Public API لميزة المصادقة — الحدود (قانون 3): لا استيراد داخلي من الخارج */
export { useAuth, useLogin, useLogout } from './hooks/useAuth'
export { usePortalAccess } from './hooks/usePortalAccess'
export { usePermissions } from './hooks/usePermissions'
export { loginSchema, resetPasswordSchema, forgotPasswordSchema } from './schemas/auth.schema'
export type { LoginInput, ResetPasswordInput } from './schemas/auth.schema'
export type { PortalAccess } from './types'
export {
  lockStatus,
  recordFailure,
  recordSuccess,
  type LockStatus,
} from './security/login-guard'
