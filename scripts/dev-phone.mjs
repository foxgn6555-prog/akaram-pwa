// 00289: تشغيل خادم التطوير للهاتف — https (شهادة محلية) + --host كي تعمل أذونات الموقع والكاميرا على الهاتف.
// الاستخدام: npm run dev:phone  ثم افتح عنوان Network على الهاتف واقبل تحذير الشهادة مرة واحدة.
import { spawn } from 'node:child_process'
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', ...process.argv.slice(2)], {
  stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, DEV_HTTPS: '1' },
})
child.on('exit', (code) => process.exit(code ?? 0))
