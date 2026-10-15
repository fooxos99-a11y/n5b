# تطبيق نخب النيتف

متابعة هذه الدفعة في [مطابقة الطالب والتقويم](../docs/native-conversion/native-student-parity.md). نتائج الأخبار والمتجر والأساس أدناه سجلات تاريخية تخص مصادرها وتواريخها؛ أعدادها وبصماتها وحالات MySQL فيها لا تصف المصدر أو بيئة التشغيل الحالية.

تطبيق React Native وExpo داخل مستودع نخب. ينقل شاشة البداية والدخول والتسجيل والجلسة الآمنة، ومراجعة طلبات التسجيل، وإدارة الطلاب والمجمعات والحلقات والمشرفين والإداريين وخطط الطلاب، والتحضير اليدوي وسياسة الموظفين وتقاريرهم، والجلسة الأسبوعية وجلسة المسار وتعويضهما، وإعداد يوم السرد وقراءة نتائجه وأرشفته وحذفه، وإعداد الاجتياز وقراءة تقارير المحاولات، والمتجر والأخبار وإرسال الإشعارات وصندوق الحساب، ومساحة الطالب وبعض وظائف المشرف والإداري بحسب منح الخادم. [دليل الأخبار والإشعارات](../docs/native-conversion/native-communications.md) يوضح آخر مرحلة وظيفية قبل دفعات مطابقة التصميم؛ [المتجر](../docs/native-conversion/native-store.md) و[التقارير](../docs/native-conversion/native-reports.md) و[التعويض والسرد والاجتياز](../docs/native-conversion/native-advanced-grading.md) و[التحضير والجلسات](../docs/native-conversion/native-sessions.md) و[إدارة الموظفين والخطط](../docs/native-conversion/native-management.md) و[وظائف الحسابات](../docs/native-conversion/native-operations.md) و[الدخول والتسجيل](../docs/native-conversion/native-auth.md) تحتفظ بشواهد المراحل السابقة. التحويل الكامل ما زال مفتوحًا.

تجربة W01 للمصحف والتخزين والمكالمة تبقى مستقلة عند ضبط `EXPO_PUBLIC_NATIVE_PROBES=1`؛ ليست نسخة الطالب أو المشرف النهائية. لا اتصال افتراضي بالإنتاج أو رمز غرفة ثابت. يتعطل بدء المكالمة حتى يصل تصريح مخوّل. لم تُنقل بيانات Capacitor.

[الأخبار والإشعارات](../docs/native-conversion/native-communications.md) آخر مرحلة وظيفية قبل دفعات مطابقة التصميم: W06-33 وW06-34 done؛ كان الإجمالي عند إغلاقها60/196 والمتبقي136. اجتازت638 اختبارًا والأنواع وLint وHermes، و154 عقدًا، و24 مجموعة متصفح/6 تنويعات/53 صورة، و27 فحصAndroid/21 صورة/122HTTP. [تدقيق الشواهد](../outputs/native-conversion/communications-harness-integrity.json) يثبت المصدر الحالي والصور والتنظيف؛ MySQL3310 المملوك stopped مع حفظ263 قاعدة. لم يُبنAPK جديد؛ استُخدم devclient المتجر معMetro الحالي. صندوق الحساب بلاdestination؛W07-16verify وW10 وpush والأجهزة الفعلية مفتوحة. [verify الحالي](evidence/communications-mobile-verify.log) ينتهي1 عند5 ثغرات عالية، و[Doctor20/21](evidence/communications-doctor.log)، وverify الجذر عند7 أخطاءLint السابقة؛ لا تغيير اعتماديات أوlockfile.

## الهوية والإصدارات

يسجل [المتجر والشراء المحلي](../docs/native-conversion/native-store.md) نتائج إغلاق تلك المرحلة التاريخية. أُغلقت W06-30/31/32 وW07-13/14 فقط، فأصبح الإجمالي 58 من196 والمتبقي138؛ W06 منجز27 من41 وW07 منجز3 من18. اجتازت152 تحققًا (144 من استجابات HTTP و8 SQL/محلية)، و557 اختبارًا والأنواع وLint وHermes. Browser6 اجتاز38 مجموعة/6 تنويعات/83 صورة فريدة/802 HTTP، مع27 طلب Node و3 تهيئة منفصلة؛ Native6 اجتاز29 فحصًا/20 صورة/207 HTTP و10 تهيئة منفصلة. تطابقت333 بصمة في كل رحلة و332 مشتركة. APK الجديد و195 بصمة مصدر/stage/current والتنظيف اجتازت، وMySQL3310 المملوك أصبحstopped بعد صفر جلسات واتصالات أخرى في42 قاعدة محفوظة؛ بقي3312/PID11980 دون تغيير. المخزون43=29 جديدًا+14 محدثة والحماية5147 دون اختلاف. full mobile verify انتهىexit1 عند5 إصابات audit عالية، وDoctor20/21؛ full root verify فشل عند7 أخطاءLint قائمة، بينما782 اختبارًا وaudit0 والبناء15.85s اجتازت مستقلة. لا أجهزة فعلية أوiPhone أوAPI36 أوW10 أو دخول بارد دون اتصال.

| العنصر | القيمة المتحقق منها |
|---|---|
| الاسم ومعرّف الرابط | نخب، `nukhab` |
| معرّف Android وiOS | `sa.nukhab.app` |
| Expo / React Native / React | `57.0.28` / `0.86.3` / `19.2.3` |
| LiveKit Native / WebRTC | `3.0.0` / `144.2.0` |
| التثبيت | npm، مع `package-lock.json` مستقل |

الإصدارات اختيرت من npm الحالي وقالب Expo 57، وموديولات Expo ثُبتت بواسطة `expo install`. مدير حزم الموقع وخادمه لم يتغيرا. `metro.config.cjs` يسمح بقراءة أصول المشروع والقواعد المشتركة، واستيرادات React داخل `mobile` تحل إلى React 19 الخاص به.

`LICENSE` يحتفظ بإشعار MIT وcopyright الخاص بقالب Expo. هذا إشعار مصدر القالب، ولا يحدد تلقائيًا ترخيص كود نخب أو الشعارات أو خطوط المصحف وأصوله. لم يتغير ترخيص المشروع.

## تشغيل التجربة محليًا

نفذ الأوامر من هذا المجلد. اضبط `EXPO_PUBLIC_API_BASE_URL` بعنوان API المتحقق منه، و`EXPO_PUBLIC_REGISTRATION_NUMBER` عند الحاجة لسياق التسجيل؛ لا توجد وجهة إنتاجية افتراضية. تحتاج نسخ Android وiOS إلى development build؛ Expo Go لا يدعم LiveKit أو SQLCipher.

```powershell
npm ci
npm run start
```

على Windows استخدم helper المحروس الموضح في قسم Windows، مع Node 24.19 أو أحدث وAndroid SDK وJava. لا تشغّل `npm run android` مباشرة من المسار العربي في هذه البيئة.

على macOS أو Linux يمكن استخدام أوامر Expo المعتادة بعد تجهيز أدوات البناء، وiOS يحتاج macOS وXcode:

```powershell
npm run android
# على macOS فقط
npm run ios
```

قبل تثبيت نسخة debug، تأكد أن جهاز الاختبار لا يحمل نسخة `sa.nukhab.app` تحتاج الحفاظ عليها. استخدم محاكيًا أو جهازًا منفصلًا؛ تثبيت التطبيق الجديد فوق Capacitor قد يستبدل التطبيق وبياناته.

لمشاهدة الواجهة في المتصفح:

```powershell
npm run web
```

المتصفح يعرض الدخول والتسجيل عند إعداد API، وتبقى جلسة المعاينة في الذاكرة فقط. `npm run test:web` يبني تجربة W01 بصورة مستقلة؛ تجربتا التشفير والمكالمة تحتاجان نسخة تطوير فعلية، ولا تُحاكى نتيجة نجاحهما.

## الفحوص

```powershell
npm run verify:quick
npm run audit
npm run verify
npm run doctor
npm run test:web
```

`verify:quick` يفحص الأنواع وLint والاختبارات وبناء JavaScript/Hermes للمنصتين. `verify` يضيف audit إلزاميًا؛ نجاح الفحص السريع لا يعني اجتياز الكامل. `test:web` يحتاج اعتماد Playwright المثبت في مستودع الموقع، ويشغّل خادمًا محليًا مؤقتًا ثم يغلقه.

| سجل الفحوص التاريخية، بدءًا من 14 أكتوبر 2026 | النتيجة والحدود |
|---|---|
| TypeScript الصارم | اجتاز |
| ESLint 10 وTypeScript ESLint 8 وReact Hooks | اجتاز دون تحذيرات |
| اختبارات المنطق والتخزين |[verify المتجربعدتغييرالرجوع](evidence/store-mobile-verify.log): types/lint/557tests و0fail/skipped وHermespassed، ثمauditfailed5 high/exit1. [قبلbackfix](evidence/store-mobile-verify-before-back-fix.log) و[528 قبلpickerfix](evidence/store-mobile-verify-before-picker-fix.log) و[438 للتقارير](evidence/reporting-mobile-current.log) تاريخية. Node لايثبتKeychain/SQLCipher علىiPhone |
| تصدير Hermes لـAndroid وiOS | اجتاز، وليس APK أو IPA |
| Expo Doctor الموثق لمرحلة المتجر |[20/21 وexit1](evidence/store-doctor.log): expo المتوقع`~57.0.29` مقابلالمثبت`57.0.28`؛21/21 السابقة تاريخية، ولا dependency/lockfile تغيّر |
| معاينة Chromium، 390 و1440 | اجتازت التحديد عبر الأسطر ومسح التحديد والانتقال بين العينات والرجوع ومنع نجاح التخزين الموهوم، دون امتداد أفقي أو أخطاء JavaScript |
| Android prebuild | اجتاز باستخدام Node 24.19.0 على Windows |
| Android Gradle/APK | اجتاز من stage ASCII قصير داخل `UserProfile/.nb`؛ debug APK لـ`x86_64` بهوية `sa.nukhab.app`، وليس إصدار متجر أو تشغيل جهاز |
| Android runtime، محاكي API 35 معزول | اجتاز عرض الهوية والعينات الثلاث والتحديد عبر سطرين، وحفظ SQLCipher واستعادته بعد force-stop وفصل الحساب والجهة وحارس فقد المفتاح؛ لا يعد دليل جهاز فعلي |
| الدخول والتسجيل، Chromium | 320 و390 و1440 في الثيمين: 18 فحصًا وربط HTTP وMySQL فعليان؛ شملت الأدوار الأربعة وإداريًا بلا منح ورفض 403/409/429 |
| جلسة Android، مرحلة الدخول السابقة | 16 فحصًا محفوظًا للدخول والخروج والاستعادة، ثم7 لنسخة تلك المرحلة بعد تحسين الشعار؛ أدلة وظائف الحسابات الحالية مستقلة |
| وظائف الحسابات، Chromium | 33 مجموعة على320 و390 و1440 في الثيمين، و103 صور، و89 بصمة مصدر؛614 طلب واجهة و117 طلب تهيئة عبر HTTP وMySQL فعليين |
| عقود وظائف الحسابات | 67 حالة HTTP وMySQL فعلية للنجاح والفشل والمنح وعزل الجهة والحفظ والقبول والحضور |
| إدارة الموظفين والخطط،Chromium |48 مجموعة عند320 و390 و1440 في الثيمين،82 صورة و98 بصمة مصدر؛ فحص القص داخل البطاقات والنوافذ والمنح والحفظ غير المؤكد وتعارض الخطط |
| التحضير والجلسات،Chromium |58 مجموعة على320 و390 و1440 في الثيمين،165 صورة و113 بصمة مصدر؛HTTP/MySQL فعليان، الحفظ والدرجات والنطاقات والتعارض والقراءة غير المؤكدة |
| التعويض والسرد والاجتياز،Chromium السابق |40 مجموعة في6 حالات320/390/1440 والثيمين،609 طلب واجهة و12 دخولًا،103 صور و298 بصمة ثابتة؛ الإنشاء والأرشفة والحذف للحدث المختار، ثم فقد الرد وفشل القراءة والمصالحة بلا إعادةPOST |
| عقود التعويض والسرد والاجتياز |134 تحققًا:116 طلبHTTP و18 مجموعةSQL/سلوك،23 بصمة مصدر؛ الأهلية والإلغاء والتكرار، معاينة قراءة فقط وتقسيم مطابق، تقارير قديمة وسياساتها، ومنح وحلقات وجهات |
| عقود الإحصائيات والتقارير |149 تحققًا فعليًا، مع 6 ملفات PDF بتوقيع/MIME و6 XLSX بأوراق وصفوف مفكوكة؛ لا دليل بصري شامل لـPDF أو واجهة مشاركة أو تسليم واتساب |
| عقود مرحلة المتجر |[152 تحققًا](../outputs/native-conversion/store-contracts.json):144 تحقق استجابةHTTP و8 SQL/محلية،وليست152 طلبًا؛27 بصمة قبل/بعد/حالية متطابقة،والأدوار والجهات والمنتجات والصور والقرار وUUID والرصيد والمخزون |
| واجهة المتجر والتخزين الأصلي في تلك المرحلة |[Browser6](evidence/store-ui.json) اجتاز38 مجموعة/6 تنويعات/83 صورة/802HTTP مع27Node و3setup مستقلة؛ [Native6](../docs/native-conversion/evidence/native-store-emulator.json) اجتاز29 فحصًا/20 صورة/207HTTP مع10setup مستقلة.333 بصمة لكل رحلة و332 مشتركة؛ [APK الجديد](artifacts/nukhab-native-store-debug-x86_64.apk) و[195 بصمة البناء](artifacts/android-store-build-stage.json) والتنظيف اجتازت. المحاكيAPI35 فقط |
| الإحصائيات والتقارير، Chromium للمرحلة السابقة |38 مجموعةكاملة في6 حالات،161 صورة و311 بصمةمتطابقة؛ الرسم والنص والاحتواء والمنح والردالمتأخر اجتازت |
| الإحصائيات والتقارير،Android للمرحلة السابقة |رحلةكاملة جديدة37 تحققًا و30 صورة و313 بصمةمتطابقة،ثلاث استعادةSecureStore،403 إخفاء ثم304 مخولًا وpayload صحيح،وحذفغيرمؤكد؛ التنظيف وإيقافMySQL اجتازا |
| التعويض والسرد والاجتياز،Android محاكى سابق | دليل مركّب محدود:42 سجل تحقق ناجحًا و33 تسمية فريدة،202 طلب تطبيق و45 تهيئة مستقلة و26 صورة؛300 بصمة قبل/بعد فيكلجزء و299 ملف تطبيق/خادم/fixture متطابقة عبرالثلاثة والمصدر الحالي. الأساسي والأرشفة overall failed لعائقين فيالأداة والذيل passed9 وexit0؛ ليست رحلة واحدة كاملة ناجحة، والتنظيف اجتاز |
| عقود التحضير والجلسات |122 تحققًا،103 طلبHTTP و19 مجموعةSQL وسلوك؛ الحالات والمنح والحلقات والجهات، المقاطع الموقعة والجزئية التاريخية والدرجات والنقاط |
| التحضير والجلسات،Android محاكى | رحلة جديدة كاملة:24 تحققًا و104 طلبHTTP و17 صورة و279 بصمة مصدر متطابقة؛ فقد الرد وفشل القراءة ثم المصالحة والاستعادة وسحب المنحة403. APK تاريخي معMetro الحالي، والتنظيف اجتاز |
| إدارة الموظفين والخطط،Android محاكى | دليل مركّب:22 تحققًا فرديًا+9 متابعة،25 شاهدًا فريدًا،86 طلبHTTP و19 صورة صالحة؛268 بصمة تطبيق بين التشغيلين و269 في المتابعة. التنظيف نجح، وAPK تاريخي يعمل معMetro الحالي |
| عقود إدارة الموظفين والخطط |137 تحققًا، منها113 طلبHTTP و24 مجموعةSQL وسلوك؛ ثلاث قواعد محلية جديدة وعزل الجهة ونطاق المشرف والإصدارات وكلمات المرور والجلسات |
| وظائف الحسابات،Android | 21 تحققًا ناجحًا،92 طلبHTTP،18 صورة،261 بصمة مصدر؛ استعادة الطالب والمشرف والإداري والحضور وإذن الموقع. الإحداثيات اصطناعية، والتنظيف نجح |
| تحقق جذر مرحلة المتجر |[verify المتجر](../outputs/native-conversion/store-root-verify.log): فاحص AGENTS اجتاز، ثم7 أخطاء Lint القائمة. [782 اختبارًا](../outputs/native-conversion/store-root-tests.log) و[التدقيق صفر](../outputs/native-conversion/store-root-audit.log) و[البناء15.85 ثانية](../outputs/native-conversion/store-root-build.log) اجتازت حينها بأوامر مستقلة، ولا تعني نجاح السلسلة الكاملة |
| iOS native build | لم ينفذ؛ المضيف Windows دون Xcode |
| Android فعلي وiPhone فعلي | لم يتوفر دليل تشغيل لأي منهما |
| audit / verify الكامل | غير مجتاز؛ العائق الأمني موضح أدناه |

تحقق مرحلة التعويض والسرد والاجتياز في [تقرير التعويض والسرد والاجتياز](../docs/native-conversion/native-advanced-grading.md)، [واجهة المرحلة](evidence/advanced-grading-ui.json)، [عقودHTTP/MySQL](../outputs/native-conversion/advanced-grading-contracts.json)، [TypeScript وLint النهائيين](evidence/advanced-grading-final-types-lint.log)، و[تصديرHermes النهائي](evidence/advanced-grading-mobile-final-build.log). [تدقيقAndroid](../outputs/native-conversion/advanced-grading-emulator-integrity.json) يربط [الجزء الأساسي](../docs/native-conversion/evidence/native-advanced-grading-emulator-core.json) و[متابعة الأرشفة](../docs/native-conversion/evidence/native-advanced-grading-emulator-archive.json) و[الذيل النهائي](../docs/native-conversion/evidence/native-advanced-grading-emulator.json)، معإبقاءنتيجةكلجزء وحدوده. مرحلة [التحضير والجلسات](../docs/native-conversion/native-sessions.md) تحفظ [ملخصها](evidence/sessions-validation.json)، [سجل280 اختبارًا](evidence/sessions-verify.log)، [واجهتها](evidence/sessions-ui.json)، [بصماتها](evidence/sessions-artifact-integrity.json)، و[عقودها](../outputs/native-conversion/sessions-contracts.json) بوصفها أدلة سابقة. شواهد [الإدارة والخطط](evidence/management-validation.json) و[العمليات السابقة](evidence/operations-validation.json) و[تشغيلAndroid لتلك المرحلة](../docs/native-conversion/evidence/native-operations-emulator.json) و[W01](evidence/validation.json) و[الدخول والتسجيل](evidence/auth-validation.json) تبقى شواهد لنسخها وتواريخها. صور تجربة المصحف في [evidence/web-ui.json](evidence/web-ui.json). فحص المتصفح استخدم تقليل الحركة، لذلك لا يعد دليلًا على جودة أنيميشن الجهاز.

دليلAndroid السابق يغطي التعويض والإلغاء والسياسة، إعداد الاجتياز وتقارير المحاولات والأخطاء المحفوظة، معاينة السرد وإنشاءه وأرشفة وحذف الحدث المنشأ نفسه، النطاقات والمنح والاستعادة الباردة. توقف الأساسي بعد19 سجلًا ناجحًا لأنالفاحص استعملlabel دونالتاريخ؛ وتوقفت متابعة الأرشفة بعد14 لأنحارس الأداة منعاسمًا يحويR مكررًا قبلالكتابة. الذيل النهائي اجتاز9؛ احتُفظت تقاريرالأجزاء والمحاولات السابقة دونتبديل failed إلىpassed. فقد رد إنشاء الفرع سجلPOST واحدًا وصلSQL ومحاولة نقل تلقائية إضافية محجوبة قبلrouting ثمGET503 وGET200 دونPOST تطبيق آخر؛ إنشاء الحافظ اللاحق منفصل. سجلاتHTTP وSQL هيالشاهد، لا مصفوفة حقن لم تُنسخ قبل توقف الأساسي. لا ضمان نقلHTTP مرةواحدة أو تسليمWhatsApp؛ مزود الاختبار محجوب قبلالتهيئة الخارجية. [MySQL3310 المملوك لمرحلة التعويض والسرد والاجتياز](../outputs/native-conversion/native-advanced-grading-mysql-runtime.json) أصبحstopped: صفرجلسات في26قاعدة وصفراتصالات أخرى، ثمSHUTDOWN وخروجالعمليتين وتحريرالمنفذ بفحصنظام مستقل، معحفظكلالقواعد وdatadir دونحذف.

[ملخص إغلاق المرحلة](evidence/advanced-grading-validation.json) و[سلامة ملفاتها وشواهدها](evidence/advanced-grading-artifact-integrity.json) يثبتان المخزون والبصمات وحدود النتائج. أدلة الأجهزة الفعلية وiPhone تبقى مفتوحة.

[شاهدAndroid للجلسات السابقة](../docs/native-conversion/evidence/native-sessions-emulator.json) تشغيل كامل جديد لتلك المرحلة، دون جمع نجاح من محاولتين فاشلتين محفوظتين. حقن فقد الرد سجل2 محاولات نقل: واحدة وصلتالخادم ونفذتSQL، والأخرى حُجبت قبلrouting حتى قراءة المصالحة؛ قيد النقاط واحد بقيمة21.5. هذا يثبت سلوك المصالحة ضمن شرط الحقن، ولا يثبت منع إعادة النقل التلقائية في كل شبكة. [MySQL3310 المملوك لتلك المرحلة](../outputs/native-conversion/native-sessions-mysql-runtime.json) أُغلق رشيقًا بعد مطابقة الملكية وصفر اتصالات مستخدم أخرى؛ كل القواعد والمرحلة محفوظة. لا تفترض أنه يعمل قبل تحقق جديد من تقريرالملكية الأحدث.

[ملخص الإدارة السابق](evidence/management-validation.json) يربط [دليلAndroid المركّب](../docs/native-conversion/evidence/native-management-emulator.json) بشواهده. يبقىoverall [التشغيل الأساسي](../docs/native-conversion/evidence/native-management-emulator-core.json) failed بسببassert يشترط200 بدل304 لطلب جلسة جديد؛ متابعة مستقلة أثبتت الاستعادة وسحب المنحة403. استُبعد سجل صورة مستبدلة، فلا يُحسب ضمن19 صورة صالحة. لم نعد بناءAPK لهذه المرحلة، ولم نمس التخزين المشفر القائم أو المحاكي الآخر. [MySQL3310 المملوك](../outputs/native-conversion/native-management-mysql-runtime.json) أُغلق بعد التحقق من الملكية وصفر اتصالات أخرى مع حفظ جميع القواعد.

آخرAPK تاريخي محفوظ اجتاز Gradle في5 دقائق و23 ثانية، وأنتج [APK للمحاكي](artifacts/nukhab-native-debug-x86_64.apk) بحجم93,425,653 بايت وبصمة `90AB1946D3F1F35EDB237B24DA11D1237B8F7EB2A6118CAD2655EABCC92A4D3A`. [تقرير بنائه](artifacts/android-build-stage.json) يثبت122 ملفًا وتنظيف المرحلة وقتالبناء. يحتوي الموقع أثناء الاستخدام ونسخ الرابط، دون إذن الموقع في الخلفية. النسخة development client تحتاج Metro للمصدر الحالي ولا تحتوي حزمة JavaScript مضمّنة؛ بصمات مرحلة البناء تصف الملفات وقت البناء، ويُثبت مصدر JavaScript الجاري بصورة مستقلة. لم يُبنAPK جديد لمرحلة التعويض والسرد والاجتياز.

البناء السابق محفوظ في `artifacts/nukhab-native-debug-auth-x86_64.apk` بحجم93,260,880 بايت وبصمة `8672A6539B5C8658AF514EB785D134487ECD436215CEF1D7A280A3F92FF1D4B5`. استغرق4 دقائق و29 ثانية؛ تحقق `aapt` من الاسم «نخب»، و`sa.nukhab.app` و`0.1.0` وABI `x86_64` وmin SDK24 وtarget SDK36. [تقرير المرحلة السابقة](evidence/android-build-stage.json) يحتفظ ببصمات الملفات الستين. لم نستبدل بصماته التاريخية. APK وملفات البناء مستثناة من Git.

[دليل المحاكي المستقل](../docs/native-conversion/evidence/android-emulator.json) يثبت تشغيل التطبيق نفسه بعد تثبيت جديد في محاكي خاص، دون استبدال تطبيق سابق. سجّل خطأ URI الأول ثم نجاح الإصلاح من المصدر الحالي عبر Metro. أصل الاختبار والبيانات مصطنعان؛ لا API خارجي أو جلسة طالب حقيقية. يمتلك هذا الدليل وكيل المراجعة المستقل.

## مصادر الأصول والمصحف

- الهوية من `../public/branding/nukhab/`، وCairo TTF من `../public/fonts/cairo/` دون نسخها أو تعديلها.
- الكلمات والتخطيط من `../public/quran/hafs/pages/` و`layout-v1/` في حالة الملفات الموجودة وقت التجربة. مصدر المصحف عليه تعديلات سابقة جارية للمستخدم، لم تُعدل ضمن هذا العمل.
- `src/domain/mushaf.ts` يستخدم `../shared/quranSelectionText.js` مباشرة لتطابق النص المحدد مع منطق الموقع.
- `scripts/prepare_mushaf_fonts.py` يحول عينات WOFF2 الموجودة إلى TTF مناسب للمنصتين. يتحقق من تطابق cmap ويكتب SHA-256 للمصدر والتخطيط والنتيجة ومقاييس عرض الحروف في `assets/fonts/manifest.json`. الاختبارات تكشف تغير المصدر بعد التحويل.
- تحويل الخطوط يغير الحاوية فقط؛ لم نغير الحروف أو الكلمات أو مخطط الموقع. metadata الخطوط تقول `King Fahad Complex, All rights reserved.` ولا تحتوي تصريح إعادة توزيع؛ تفسير ترخيص المصدر وحقوق توزيعه يحتاج إغلاقًا قبل إصدار خارجي. مصدر الجلب الحالي مذكور في سكربت الموقع `../scripts/generate-mushaf-v1-display.mjs`.

لإعادة تجهيز العينات عند تغير أصول الموقع، استخدم Python مع `fonttools[woff]`، ثم شغّل `python scripts/prepare_mushaf_fonts.py` والاختبارات. بيئة أدوات Python المحلية `.tools-venv` مستثناة من Git.

## التشفير والفصل بين الحسابات

`encryptedProbeStore` يفتح قاعدة مستقلة باسم `nukhab-native-probe-v1.db` مع SQLCipher مفعّل في `app.json`. ينشئ مفتاحًا عشوائيًا من 32 بايت داخل SecureStore ويطلب `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. لا يحفظ المفتاح في الكود أو SQLite أو السجلات، ولا ينشئ بديلًا عندما تكون قاعدة البيانات موجودة ومفتاحها مفقودًا. يمنع استمرار التجربة إذا لم تُرجع المكتبة `cipher_version`.

كل عملية تحفظ `tenant` و`account` ومعرف العملية داخل مفتاح مركب؛ النطاق ثابت لمستخدم مصطنع حاليًا، ولا توجد جلسة حقيقية. المسودة والجلسة في هذه التجربة snapshot غير قابل للاستبدال؛ إعادة إرسال نفس المعرف لا يكتب سجلًا جديدًا. هذه ليست مسودة المعلّم القابلة للتحرير، ولا تثبت وصول عملية إلى الخادم مرة واحدة.

تستعمل عمليات الحفظ transaction على مقبض SQLCipher خاص مهيأ بالمفتاح، مع قفل متزامن لتفاعلات الشاشة. `withExclusiveTransactionAsync` في Expo 57 ينشئ اتصالًا جديدًا دون نقل `PRAGMA key`؛ لذلك لم نستخدمه. جميع قيم البيانات مربوطة parameters، وعبارة المفتاح تقبل فقط hex مولدًا محليًا من 64 حرفًا. Android backup معطل للتجربة حتى لا تنسخ قاعدة دون مفتاحها.

اختبار المحاكي كشف فشلًا قبل إنشاء القاعدة عند `database-file-check`: `defaultDatabaseDirectory` في Expo SQLite 57 على Android مسار خام، بينما `File` الحديث يحتاج URI مطلقًا. `probeDatabaseDirectoryUri` يحوله إلى `file:///` لنفس الدليل ويحافظ على URI الموجودة، دون اختيار دليل بديل أو تجاوز قاعدة قديمة. نجح بعدها فحص الاستعادة الفارغة والحفظ والاستعادة بعد إغلاق العملية على المحاكي. هذا إصلاح JavaScript؛ APK نفسه development client يستخدم المصدر الحالي عبر Metro.

التشخيص التقني يعرض مرحلة محددة ونوعًا عامًا ورمزًا ثابتًا من قوائم مغلقة؛ لا يعرض native error message أو code الخام أو SQL أو key أو stack أو مسارات الملفات. اختبارات التشخيص تتحقق من منع تسريب هذه التفاصيل.

بلغ ملف القاعدة المصطنعة على المحاكي 12,288 بايت، ولم يحمل رأس SQLite غير المشفر. فحص فقد المفتاح بإخفاء SecureStore داخل sandbox بصورة قابلة للتراجع أعطى `missing-key` قبل فتح القاعدة؛ بقيت SHA-256 للقاعدة مطابقة، ولم يُنشأ ملف SecureStore بديل. أعيد الملف الأصلي ثم نجحت الاستعادة بنفس تاريخ الحفظ، دون قراءة المفتاح أو نسخه خارج التطبيق.

تبقى هذه الفحوص مطلوبة على Android فعلي وiPhone فعلي، وتبقى مزامنة الخادم وترحيل Capacitor غير منفذين.

## عائق تدقيق الاعتماديات

يوجد advisory واحد ينتشر إلى خمس حزم: [CVE-2026-85393 / GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). يصيب `node-forge <=1.4.0`، ولا تسجل قاعدة GitHub نسخة مصححة عند الفحص.

```text
@config-plugins/react-native-webrtc 15.0.2
└─ expo 57.0.28
   └─ @expo/cli 57.0.29
      ├─ node-forge 1.4.0
      └─ @expo/code-signing-certificates 0.0.6
         └─ node-forge 1.4.0
```

الاستخدام المباشر المثبت هنا في أدوات توقيع وشهادات Expo CLI؛ `App` وخدمات الجوال لا تستورد forge. وجودها في شجرة dependencies لا يلغي المخاطرة، ولذلك يبقى audit وverify الكامل فاشلين. اقتراح npm التلقائي هو Expo 44 ويكسر التوافق، ولم ينفذ. لا `--force` أو إخفاء advisory. استُخدم fork `../shared/vendor/braces-safe` المعتمد في المستودع وuuid `11.1.1` لمعالجة التنبيهات الأخرى مع إبقاء سجل التدقيق واضحًا.

## ملاحظات Windows

Node 22.18.0 الموجود على المضيف أعاد `fs.cpSync` دون نسخ مجلد Android عند التجربة، فأخفق Expo prebuild برسالة `MainApplication does not exist`. تكرر نفس نسخ القالب باستخدام Node 24.19.0 المرفق مع أدوات مساحة العمل ونجح؛ لا تعديل على `node_modules` أو مولدات Expo. استخدم Node 24 حديثًا لتجهيز native على Windows في هذه البيئة.

`gradlew.bat` أفقد المسار العربي ترميزه. استدعاء Java مباشرة باستخدام مسار jar نسبي تجاوز ذلك. جرى تشغيل Kotlin in-process للتعامل مع ترميز ملفات خيارات المترجم، مع خيارات CLI مقتبسة كاملة. هذه إجراءات محلية، ولا تغير المصدر أو إعداد نشر.

بعد نجاح تجميع plugins توقف Android Gradle لأن مسار المستودع يحتوي حروفًا غير ASCII. لم نعطّل `android.overridePathCheck`. يلزم مسار بناء ASCII آمن يحافظ على نفس المصدر، أو مضيف مناسب؛ لم يُنشأ APK من محاولة المسار العربي.

محاولة mapping مؤقت على `N:` اجتازت فحص AGP، ثم أخفقت RN codegen لأن بعض autolinking أعادت مسار `C:` بينما بقية البناء بقيت على `N:`. أزيل mapping، ولا نعتمد هذه الطريقة لإعادة البناء.

محاولتا stage داخل `LocalAppData/nukhab-native-builds` تجاوزتا Java وcodegen، لكن Ninja رفض طول source/object فوق 260 حرفًا؛ اختصار اسم stage أصلح object directory ولم يكف لمسار source الذي يتوسع تحت مسار تطبيق Windows.

المسار التشغيلي الذي اجتاز البناء في [scripts/build-android-debug.ps1](scripts/build-android-debug.ps1) يجهز stage فريدًا داخل `UserProfile/.nb` بحروف ASCII وعلى نفس drive لتقصير source وobject معًا. هذه حاجة بناء محلية موثقة خارج المستودع، وليست نسخة منتج. يحجز parent الجديد بإشعار ملكية للمصدر ويرفض parent موجودًا لا يملك إشعاره. ينسخ فقط مصادر الجوال وأصوله وقواعد shared المطلوبة، ويسجل SHA-256 للمصدر والنسخة، ثم يثبت npm مستقلًا ويجهز Android ويبنيه. لا ينسخ `.env` أو الخادم أو بيانات المستخدم أو `node_modules` المصدرية.

الـhelper يفحص Node 24.19 أو أحدث وSDK وJava، ويستعمل UTF-8 وKotlin in-process، ثم يعيد متغيرات بيئة العملية وينظف stage الذي أنشأه فقط بعد التحقق من العنوان الكامل والـparent والاسم وعدم كونه link. يحفظ نتيجة المرحلة والبصمات في `artifacts/android-build-stage.json`، وAPK في `artifacts/nukhab-native-debug-x86_64.apk` فقط إذا نجح Gradle وتطابقت بصمة النسخ. لا ينهي daemons كانت تعمل مسبقًا:

```powershell
.\scripts\build-android-debug.ps1
# الأمر الذي اجتاز على هذا المضيف، لأن Node في PATH أقدم:
$taskNode24 = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
.\scripts\build-android-debug.ps1 -NodeExecutable $taskNode24
```

`x86_64` هنا للمحاكي فقط. بناء APK لا يثبت التشغيل على Android فعليًا، ولا تنتج هذه الخطوات بناء iOS أو إصدار متجر. انتهت المرحلة بنجاح و`cleaned: true`؛ يبقى parent وإشعار ملكيته فقط لإعادة التشغيل، دون mapping أو مرحلة مؤقتة باقية. لم يوقف helper أي daemon سابق.

تشغيل مرحلة التقارير السابقة استعملAPK التاريخي معMetro دونبناءجديد. علىAndroid فُقدbodyDELETE بعدترويسات200؛503 قبلالرجوع وبعده أبقتالقفل حتىغيابالقائمة و404 مخول،ورُصدDELETE واحدوبقيأرشيفان؛ لاعدادSQL مستقل أوضمانذري. إعادةمنحةالإداري أثبتتطلبًا جديدًا304 لنفسquery بعدmarker معpayload صحيح؛ يمكنإعادةاستخدامbodycache ولا يعنيتنزيلbody200 جديدًا. Node27 memory-only منفصل عنثلاث الاستعاداتالباردةمنSecureStore. [تدقيق القواعد السابق](../outputs/native-conversion/reporting-database-audit.json) و[ملكيةMySQL السابقة](../outputs/native-conversion/native-reporting-mysql-runtime.json) يخصان تلك المرحلة فقط.

## الخطوات التي ما زالت مفتوحة

تعطيل التقارير يأتي من `platformPolicy:reportsSectionEnabled='disabled'`، ويجب تأكيد false في `/public-settings`؛ `tenant` يعيد true وفق149 تحققًا و24 بصمة مصدر مطابقة. كتابة العلم الخام false لا تثبت التعطيل. الشاهد الخام القديم محفوظ مستقلًا ولم يعد إثباتًا للقيمة الفعالة، والعقود الحالية تثبت overview200 للمخول تحت false الفعلية وفق حارس الواجهة الحالي.

أُغلقت [الإحصائيات والتقارير](../docs/native-conversion/native-reports.md) W06-24 إلىW06-28 وW09-03؛ الإجمالي53 من196 وبقي143،W06 منجز24 من41 وW09 منجز4 من7. [438 وحدة والأنواع وLint وHermes](evidence/reporting-mobile-current.log)، [149 عقدًا](../outputs/native-conversion/reporting-contracts.json)، [38 مجموعةمتصفح](evidence/reporting-ui.json) و[37 تحققAndroid جديد](../docs/native-conversion/evidence/native-reporting-emulator.json) اجتازت. [ملخص الإغلاق](evidence/reporting-validation.json) و[سلامة الملفات والحماية](evidence/reporting-artifact-integrity.json) و[تدقيق الشواهد](../outputs/native-conversion/reporting-harness-integrity.json) يربطان المخزون25 ملفًا و191 صورة وبصمات24/311/313 وخط الأساس4617، دونحملالأدلةالتاريخية إلىالمصدرالحالي.

W01-01 إلى W01-04 تحتاج بقية أدلة Android وiPhone، وتبقى المزامنة والمكالمة والترحيل مفتوحة. أُغلقت W02-02 بمطابقة الهوية، وW02-09 لعميل API والجلسة، وW02-11 للمشاركة والعزل باختبارات الطلبات المتأخرة. تبقى بقية أساس الواجهة والتنقل ومراحل الحسابات مفتوحة في [الخطة](../docs/native-conversion-plan.md)، ولا يعني تنفيذها الأولي إغلاقها.

أُغلقتW06-14 إلىW06-17 فيالمرحلة السابقة، ثمW06-18 وW06-19 وW06-21 وW06-22 بالعقود والواجهة ودليلAndroid المركّب الحالي، فأصبح الإجمالي47 من196 وبقي149، منها19 من41 فيW06. قراءة نتائج السرد والاجتياز لا تغلق الكاتبين التفاعليينW06-20 وW06-23. التقييم بالمصحف وبقية وظائف الإدارة والمزامنة والأجهزة الفعلية ما زالت مفتوحة؛ لم تُغير سياسة تنفيذ القرآن عند المشرف أو معيارW08-02.

مسودة السرد في الذاكرة فقط، ولا تغلق التخزين الدائم أوالطابور فيW10. معاينته تعاد قبلإنشائه دون ضمان ذري بينGET وPOST؛ كذلك فحص القراءة الحديثة قبلPUT لا يوفر إصدارًا ذريًا. `messageQueued` لا يؤكد التسليم، وحاجزWhatsApp في أدوات الفحص لا يثبت تكاملًا خارجيًا. Android استعملAPK التاريخي معMetro الحالي دونبناءجديد، وبقيت نتائج فشل أداتيالفحص صريحة داخل الدليل المركّب.

نُفذ SQL محلي على قواعد MySQL اصطناعية ومعزولة للفحوص فقط؛ لا SQL إنتاجي أو Cap sync أو commit أو push أو نشر أو تغيير توقيع. مراجعة AGENTS: اجتازت مع القيود الموثقة أعلاه.

تخزين المتجر مستقل عن تجربةW01: `nukhab-native-store-v1.db` ومفتاحSecureStore مستقل، وفقده عندوجودDB يمنع بديلًا وفق التصميم المحروس. [المنسق](src/services/storePurchaseCoordinator.ts) يحفظUUID وتاريخ العمل والحمولة قبلPOST، ويمنع الشراء الجديد أثناء المعلق، ويعيد الإرسال بمعرفه نفسه دونحجز ثان. [التخزين الأصلي](src/services/studentStoreStorage.ts) يحدّثsnapshot والطابور بمعاملة محلية؛ [نسخة المتصفح](src/services/studentStoreStorage.web.ts) ذاكرة فقط. Native6 أثبت حفظ الطابور وإغلاق العملية واستعادته بنفسUUID وقيدSQL واحد؛ لا اختبار فقد مفتاح أو قراءة ترويسةDB ولا ملفات تفضيلات/مفاتيح، ولا دخول بارد دون اتصال أوW10 أوiPhone. حدJSON1MiB أصغر منحد صورة الخادم10MiB؛ الحارس المحلي يمنع الطلب الأكبر، و413 نتيجة تحقق معروفة. اختيار الصورة أعاد استخدامexpo-file-system دوناعتماديات، وأُنتجAPK جديد لإعدادBack بعد إصلاحعودة النشاط.

[ملخص إغلاق المتجر](evidence/store-validation.json) و[سلامة الملفات والحماية](evidence/store-artifact-integrity.json) يثبتان58 من196 و138 متبقية ومخزون43 ملفًا والحماية5147 وخط الأساس5162. [تدقيق الأدوات](../outputs/native-conversion/store-harness-integrity.json) و[تدقيق42 قاعدة](../outputs/native-conversion/store-database-audit.json) و[MySQL stopped](../outputs/native-conversion/native-store-mysql-runtime.json) أكدت حينها صفرجلسات واتصالاتأخرى وحفظالقواعد وdatadir وAVD وعدممس3312/PID11980. لم تُسجّل أحداث إغلاق DevMenu أو onboarding في الرحلة النهائية؛ تعاملUI فقط مننقطةالحساب خارجTools. لا نشر أوSQL إنتاجي أوcommit/push أوتغييرسياسةالقرآن أوالمصحف.

مراجع التكامل: [Expo 57](https://docs.expo.dev/versions/v57.0.0/)، [SQLite/SQLCipher](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)، [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)، [خطوط Expo](https://docs.expo.dev/develop/user-interface/fonts/)، [LiveKit Expo](https://docs.livekit.io/transport/sdk-platforms/expo/).
