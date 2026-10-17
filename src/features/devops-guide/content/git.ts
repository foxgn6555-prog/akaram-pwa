/** 00275 — دليل Git ورفع التحديثات: مكتوب لصاحب المشروع، بأمثلة من سير عملنا الفعلي */
import type { Guide } from '../types'

export const gitGuide: Guide = {
  slug: 'git',
  title: 'Git ورفع التحديثات',
  subtitle: 'كيف تصل التحديثات إلى جهازك ثم إلى GitHub ثم إلى قاعدة البيانات — بالترتيب الصحيح ودون فوضى',
  notice: 'القاعدة الذهبية: كل تحديث = باتش واحد ← تطبيقه ← (ترحيل قاعدة البيانات إن وُجد) ← رفع إلى GitHub. لا تقفز خطوة ولا تغيّر الترتيب.',
  sections: [
    {
      id: 'concepts',
      title: '١ · المفاهيم بكلمات بسيطة',
      intro: 'قبل الأوامر، هذه هي الكلمات التي ستراها دائماً:',
      concepts: [
        { term: 'المستودع (Repository)', meaning: 'مجلد المشروع مع تاريخه الكامل. عندك نسختان: محلية على جهازك (C:\\fox) ونسخة على GitHub.', example: 'C:\\fox هو المستودع المحلي، وhttps://github.com/foxgn6555-prog/akaram-pwa هو المستودع البعيد.' },
        { term: 'الالتزام (Commit)', meaning: 'لقطة محفوظة من المشروع برسالة تشرح ما تغيّر. كل جولة عندنا = التزام واحد.', example: '«00274: صيانة الزعفرانية (٤/٤) — صفحة ورش الصيانة…» هو التزام.' },
        { term: 'الفرع (Branch)', meaning: 'خط عمل مستقل من الالتزامات. نعمل على فرع محلي ونرفعه إلى فرع بعيد.', example: 'فرعك المحلي port-00134، والفرع البعيد على GitHub local-main-20260920.' },
        { term: 'الباتش (Patch)', meaning: 'ملف نصي يحوي التزاماً كاملاً (التغييرات + الرسالة). أرسله لك وتطبّقه بأمر واحد.', example: 'round-00274-maintenance-workshops-admin.patch' },
        { term: 'البعيد (Remote / origin)', meaning: 'اسم مختصر لعنوان GitHub داخل مستودعك. origin = مستودعك على GitHub.', example: 'git push origin … تعني: ارفع إلى GitHub.' },
        { term: 'الترحيل (Migration)', meaning: 'ملف SQL مرقّم يغيّر قاعدة البيانات. Git لا يطبّقه؛ تطبّقه أنت بأمر Supabase منفصل.', example: 'supabase/migrations/00243_maintenance_workshops_admin.sql' },
      ],
    },
    {
      id: 'workflow',
      title: '٢ · سير العمل المعتمد (ما تفعله مع كل جولة)',
      intro: 'هذه الخطوات الثلاث هي كل ما تحتاجه في ٩٥٪ من الحالات. تُنفَّذ داخل مجلد المشروع.',
      steps: [
        { title: 'افتح الطرفية داخل المشروع', body: 'افتح PowerShell أو Git Bash ثم انتقل إلى مجلد المشروع. كل الأوامر التالية تفترض أنك هنا.', cmd: 'cd C:\\fox' },
        { title: 'طبّق الباتش', body: 'ضع ملف الباتش في مجلد المشروع ثم طبّقه. --3way تجعل Git يحاول الدمج الذكي إن اختلفت بعض الأسطر. عند النجاح ترى: Applying: 00274: …', cmd: 'git am --3way round-00274-maintenance-workshops-admin.patch' },
        { title: 'طبّق ترحيل قاعدة البيانات (فقط إن قلتُ «ترحيل»)', body: 'يرفع ملفات الترحيل الجديدة إلى Supabase بالترتيب. إن لم يكن في الجولة ترحيل فلا تنفّذه (لن يضر لكنه بلا فائدة).', cmd: 'npx supabase db push' },
        { title: 'ارفع إلى GitHub', body: 'يرسل التزاماتك المحلية إلى الفرع البعيد. بعدها تتحقق أنا من التطابق قبل الجولة التالية.', cmd: 'git push origin port-00134:local-main-20260920' },
        { title: 'عدة باتشات دفعة واحدة؟', body: 'طبّقها بالترتيب الرقمي (00271 ثم 00272 …) ثم db push مرة واحدة في النهاية ثم push واحد.', cmd: 'git am --3way round-00271-*.patch round-00272-*.patch' },
      ],
    },
    {
      id: 'daily',
      title: '٣ · أوامر الاستخدام اليومي',
      commands: [
        { cmd: 'git status', what: 'يعرض حالة المشروع: هل هناك ملفات معدّلة غير محفوظة؟ على أي فرع أنت؟', when: 'قبل أي باتش وبعده. يجب أن ترى «nothing to commit, working tree clean».', example: 'إن ظهرت ملفات حمراء قبل التطبيق فهناك تعديلات يدوية ستعرقل الباتش — انظر قسم الإنقاذ.', ifFails: 'لا يفشل. إن ظهر «not a git repository» فأنت في المجلد الخطأ: cd C:\\fox', danger: 'safe' },
        { cmd: 'git log --oneline -5', what: 'آخر ٥ التزامات بسطر واحد لكل التزام (رمز + رسالة).', when: 'للتأكد أن الباتش طُبّق: يجب أن تكون رسالة الجولة في أول سطر.', example: '8e2d0dee 00274: صيانة الزعفرانية (٤/٤) …', ifFails: 'إن لم تظهر الجولة فلم يُطبَّق الباتش — أعد git am.', danger: 'safe' },
        { cmd: 'git am --3way <ملف.patch>', what: 'يطبّق الباتش كالتزام جديد بنفس الرسالة والمؤلف.', when: 'مع كل جولة أرسلها.', example: 'git am --3way round-00270-ops-leave-requests.patch', ifFails: '«Patch failed at …» ⇒ نفّذ git am --abort ثم تأكد من git status نظيف وأن الباتشات السابقة مطبّقة، ثم أعد المحاولة. «previously applied» ⇒ الباتش مطبّق مسبقاً: git am --skip.', danger: 'care' },
        { cmd: 'git am --abort', what: 'يلغي تطبيق باتش فشل في منتصفه ويعيد المشروع لما قبله.', when: 'فوراً بعد أي فشل في git am، قبل أي شيء آخر.', example: 'Patch failed at 0001 ⇒ git am --abort', ifFails: 'إن قال «no am session» فلا يوجد تطبيق معلّق؛ الأمر غير مطلوب.', danger: 'safe' },
        { cmd: 'git push origin port-00134:local-main-20260920', what: 'يرفع فرعك المحلي إلى الفرع البعيد على GitHub.', when: 'بعد التطبيق (وبعد db push إن وُجد ترحيل).', example: 'الناتج ينتهي بسطر مثل: bd62b89f..8e2d0dee port-00134 -> local-main-20260920', ifFails: '«rejected / non-fast-forward» ⇒ الفرع البعيد فيه التزامات ليست عندك؛ لا تستخدم --force، أخبرني لأتحقق. «Authentication failed» ⇒ سجّل دخول GitHub من جديد (Git Credential Manager).', danger: 'care' },
        { cmd: 'git fetch origin', what: 'يجلب آخر معلومات GitHub دون تغيير ملفاتك.', when: 'عندما تريد مقارنة المحلي بالبعيد.', example: 'ثم: git log --oneline -1 origin/local-main-20260920', ifFails: 'فشل الشبكة/الاعتماد فقط. لا يغيّر شيئاً محلياً أبداً.', danger: 'safe' },
        { cmd: 'git diff --stat HEAD origin/local-main-20260920', what: 'يُظهر الفرق بين نسختك ونسخة GitHub (بعد fetch). فارغ = متطابقان.', when: 'عند الشك «هل رفعت آخر جولة؟»', example: 'لا ناتج ⇒ متطابق تماماً.', ifFails: 'إن ظهرت ملفات فهناك فرق: إمّا لم ترفع (push) أو هناك تعديل محلي.', danger: 'safe' },
        { cmd: 'git branch --show-current', what: 'اسم الفرع الذي تقف عليه.', when: 'يجب أن يكون port-00134 دائماً قبل التطبيق.', example: 'port-00134', ifFails: 'إن كان غيره: git switch port-00134', danger: 'safe' },
      ],
    },
    {
      id: 'rescue',
      title: '٤ · أوامر الإنقاذ (اقرأ التحذير قبل التنفيذ)',
      intro: 'تُستخدم فقط عندما يتعطّل شيء. الأوامر الحمراء تمسح تعديلات محلية غير محفوظة.',
      commands: [
        { cmd: 'git stash', what: 'يخبّئ التعديلات المحلية غير المحفوظة جانباً ليصبح المشروع نظيفاً.', when: 'عندما يرفض git am العمل بسبب ملفات معدّلة وتريد الاحتفاظ بها مؤقتاً.', example: 'git stash ⇒ طبّق الباتش ⇒ git stash pop لاستعادتها.', ifFails: '«No local changes to save» = لا شيء يحتاج تخبئة.', danger: 'care' },
        { cmd: 'git checkout -- .', what: 'يلغي كل التعديلات اليدوية في الملفات المتتبعة ويعيدها لآخر التزام.', when: 'عندما عدّلت ملفاً بالخطأ ولا تريد الاحتفاظ به.', example: 'عدّلت ملف CHANGELOG بالخطأ ⇒ هذا الأمر يعيده.', ifFails: 'لا يسترجع ما حذفه؛ تأكد قبل التنفيذ.', danger: 'danger' },
        { cmd: 'git reset --hard origin/local-main-20260920', what: 'يجعل نسختك المحلية مطابقة تماماً لنسخة GitHub ويمسح أي التزام أو تعديل محلي ليس على GitHub.', when: 'عند «طابق المستودع» أو عندما تتلخبط الأمور ويكون GitHub هو المرجع.', example: 'git fetch origin ثم git reset --hard origin/local-main-20260920', ifFails: 'نفّذ git fetch origin أولاً وإلا طابق نسخة قديمة. كل ما لم يُرفع سيضيع — هذا مقصود.', danger: 'danger' },
        { cmd: 'git am --skip', what: 'يتخطى باتشاً واحداً في سلسلة تطبيق متوقفة.', when: 'فقط عندما يقول Git إن الباتش مطبّق مسبقاً.', example: 'The patch was previously applied ⇒ git am --skip', ifFails: 'إن لم تكن متأكداً فاستخدم --abort وأخبرني.', danger: 'care' },
        { cmd: 'git clean -fd', what: 'يحذف الملفات الجديدة غير المتتبعة (ملفات أضيفت ولم تُلتزم).', when: 'نادراً؛ عند بقاء ملفات غريبة تعرقل التطبيق.', example: 'جرّب أولاً git clean -nd لترى ما سيُحذف دون حذف.', ifFails: 'الحذف نهائي. يُفضَّل سؤالي قبله.', danger: 'danger' },
      ],
    },
    {
      id: 'errors',
      title: '٥ · رسائل شائعة ومعناها',
      faq: [
        { q: 'error: patch failed … / Patch failed at 0001', a: 'ملف في نسختك يختلف عمّا يتوقعه الباتش. غالباً باتش سابق لم يُطبَّق أو تعديل يدوي. نفّذ git am --abort ثم git status ثم أعد التطبيق بالترتيب. إن تكرر أرسل لي ناتج الأمرين.' },
        { q: 'The patch was previously applied', a: 'طبّقته من قبل. git am --skip ثم تابع.' },
        { q: 'Everything up-to-date', a: 'عند push: لا شيء جديد للرفع — GitHub محدّث أصلاً.' },
        { q: 'fatal: not a git repository', a: 'لست داخل مجلد المشروع. cd C:\\fox' },
        { q: 'Your local changes would be overwritten', a: 'لديك تعديلات محلية. إمّا git stash (تحتفظ بها) أو git checkout -- . (تلغيها).' },
        { q: 'npx supabase db push يقول «Remote migration versions not found»', a: 'سجل الترحيلات على السحابة لا يطابق الملفات. لا تنفّذ repair بنفسك — أرسل لي الناتج كاملاً.' },
        { q: 'هل أستطيع تعديل ملف ثم رفعه بنفسي؟', a: 'تقنياً نعم، لكنه يكسر تطابق النسخ ويعرقل الباتشات التالية. القاعدة: كل تغيير يمر عبر باتش.' },
      ],
    },
  ],
}
