/** قارئ .env.local مشترك — بلا مكتبات خارجية */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export function loadEnvFile() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const env = {}
  try {
    for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && !line.trim().startsWith('#')) {
        const value = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '')
        if (value !== '') env[m[1]] = value
      }
    }
  } catch {
    console.error('❌ .env.local غير موجود في جذر المشروع')
    process.exit(1)
  }
  return env
}

export const VALID_ROLES = [
  'employee', 'hr_officer', 'department_manager',
  'finance_officer', 'it_admin', 'super_admin',
]

export const ROLE_PORTALS = {
  employee: '/employee',
  hr_officer: '/hr',
  department_manager: '/manager',
  finance_officer: '/finance',
  it_admin: '/it',
  super_admin: 'كل البوابات',
}
