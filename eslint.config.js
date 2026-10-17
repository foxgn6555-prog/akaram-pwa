import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'src/types/database.types.ts', 'public/flowbridge/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // معطَّل: تحذير Fast Refresh يخص التطوير فقط (الملف الذي يصدّر مكوّناً مع دوال/ثوابت مساعدة
      // يُعاد تحميله كاملاً عند التعديل بدل HMR الجزئي) ولا أثر له في الإنتاج. نمط المشروع يضع
      // المساعدات بجانب مكوّنها، و`lint` يرفض أي تحذير (max-warnings 0).
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // حدود معمارية: منع استيراد Supabase خارج services/
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@supabase/supabase-js', '@supabase/*'],
            message: 'قانون SDK: استورد من @sdk/* — الاستيراد المباشر لـ Supabase محظور خارج src/services.' },
        ],
      }],
    },
  },
  {
    // سكربتات Node (mjs) — globals بيئة Node
    files: ['scripts/**/*.mjs', 'k6/**/*.js', 'tools/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', fetch: 'readonly', setTimeout: 'readonly',
        URL: 'readonly', Buffer: 'readonly', __ENV: 'readonly',
        __VU: 'readonly', __ITER: 'readonly', sleep: 'readonly',
        check: 'readonly', http: 'readonly', Rate: 'readonly',
        group: 'readonly',
      },
    },
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // استثناء: vite.config و config files تحتاج استيرادات بناء
    files: ['*.config.ts', '*.config.js', 'scripts/**', 'src/workers/**', 'src/config/**', 'src/services/**', 'tests/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
