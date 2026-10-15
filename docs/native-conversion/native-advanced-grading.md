# نقل التعويض وإعداد السرد والاجتياز

أُغلقت W06-18 وW06-19 وW06-21 وW06-22 بعد تحقق السلوك والعقود المحلية والمتصفح ودليل Android المركّب، فأصبح الإجمالي **47 من196 خطوة `done`** وبقي149، منها19 من41 فيW06. [الخطة](../native-conversion-plan.md) تسجل معيار كل خطوة وشاهدها. شواهد [التحضير والجلسات](native-sessions.md) و[الإدارة والخطط](native-management.md) و[العمليات](native-operations.md) محفوظة لمصادرها وتواريخها.

## السلوك المنقول

| الخطوة | السلوك وحدوده |
|---|---|
| W06-18 | عرض الأيام المؤهلة لتعويض البرنامج وجلسة المسار، الأعذار المعتمدة، السجل وتاريخ التعويض والمشرف، تسجيل التعويض بعد تأكيد، وإلغاؤه إداريًا مع سبب. البرنامج تعويض لليوم، والمسار تعويض واحد في الأسبوع؛ التاريخ المستقبلي أو غير المؤهل والتكرار يرفضهما الخادم. الإلغاء يبقي أثره وتاريخ الحضور ويعيد الإنجاز والنقاط وفق القواعد الحالية. إعداد السماح بتعويض القرآن والتجاوز يستخدم الحقلين الحاليين دون تغيير سياسة تنفيذ القرآن. |
| W06-19 | إعداد الاسم والتاريخين والمجمع والحلقات، وطريقتي «المحفوظ كامل» و«يدوي». اختيار طالب أو مجموعة، إضافة حتى30 نطاقًا لكل طالب وتعديلها وإزالتها، معاينة النطاقات المدمجة والمقادير وتقسيم الأجزاء والطلاب المستبعدين قبل الإنشاء. المحفوظ الكامل يُحسب حتى نهاية يوم البداية بحاسب الخادم نفسه المستخدم في الإنشاء. المعاينة الخالية تبقى قراءة صحيحة؛ الإنشاء عندها ممنوع في التطبيق لجميع الأدوار كي لا ينشأ حدث لا يستطيع المشرف استعادته. |
| W06-21 | اختيار الحدث أو الأرشيف، عرض النتائج الجزئية والكاملة المحفوظة والمقادير والتقدير والمسمعين والمقيمين وعلامات الخطأ واللحن والتردد والتنبيه وملاحظاتها، وقراءة آيات المقطع من الخادم. إنهاء حلقة محددة أو كل الحلقات المتاحة، ثم حذف الأرشيف بتأكيد يوضح حذف النتائج ونقاط السرد. الأرشفة الجزئية تبقي الحدث مفتوحًا ما دام لديه طلاب غير مؤرشفين، ولا يوجد مسار لإعادة الفتح. التواصل التلقائي منفصل عن نجاح الحفظ؛ حالة التسليم غير مؤكدة. |
| W06-22 | قائمة الاجتياز والبحث والمجمع والحلقة، فرع جزء محدد أو الحافظ، الأجزاء الكاملة المؤهلة ونطاقاتها، إنشاء اختبار صحيح، واستعادة الاختبارات والمحاولات المحفوظة وتقاريرها وسياسة كل محاولة وعلاماتها وقرار إعادة الحفظ المسجل. المحفوظ السابق وحده لا يؤهل اختبار الفرع؛ قد يؤهل أجزاء الحافظ بحسب الخادم. إنشاء اختبار جارٍ مكرر يُرفض409. |

لا كاتب تقييم سرد أو اجتياز جديد في التطبيق. عرض النتائج القديمة لا يغلق W06-20 أوW06-23؛ العدادات والمصحف وقرارات إعادة الحفظ التفاعلية ما زالت تحتاج نقلًا واختبارًا. عينات [MushafProbe](../../mobile/src/screens/MushafProbe.tsx) ليست قارئ تسميع عامًا. W08-02 يبقى مفتوحًا، ولم يُضف شرط تحضير موظف قبل العمل غير مطبق في الموقع.

## العقود والصلاحيات والحفظ

تعويض البرنامج يتبع `quranEvaluation` أو`weeklySession`، وتعويض المسار يتبع `trackSession`؛ المنحة القديمة`grades` تتوسع بالقواعد المشتركة. تعديل السياسة وإلغاء التعويض يحتاجان`settings` أيضًا. السرد يتبع`narrationDay` وعلم`narrationSectionEnabled` الحقيقي؛ الاجتياز يتبع`quranPassing` دون اختراع علم تعطيل مستقل. المدير مسموح بحسب العقد، والإداري يحتاج المنحة، والمشرف محصور في حلقاته، والطالب ممنوع. لا نطاق حلقات مصطنع للإداري.

أضيف عقدا قراءة محدودان فقط: `GET /narration-events/preparation-references` و`POST /narration-events/preparation-preview`. يطبقان منحة السرد نفسها دون إضافة منح عامة لمرجع القرآن. المعاينة والإنشاء يتشاركان اختيار الطلاب وحاسب النطاقات وتقاطعها مع حدود الأجزاء؛ HTTP المعاينة لا يكتب حدثًا أو خطة أو محفوظًا أو نقاطًا. تُعرض قيم الأوجه الخام التي يعيدها الحاسب، ولا تُفترض قيمة وجه ثابتة للنطاق؛ مقارنة SQL توحد أسماء الحقول وتنسيقها فقط وفق دقة العقد.

الخدمات تتحقق من الحساب والدور والجهة والمنح قبل الطلب وبعده. فحص قراءة حديثة قبل إنشاء السرد أو الاجتياز، والتعويض والإلغاء، ودمج أحدث إعدادات كامل قبل تغيير الحقلين، يرفض التغيير المعروف مسبقًا؛ لا يوجد قفل إصدار ذري يضمن منع السباق بين GET وPOST أوPUT. تبقى ضمانات المزامنة فيW10 مفتوحة.

فقد الرد لا يسمح بإعادة الكتابة تلقائيًا. السرد يحتفظ بالعملية غير المؤكدة في ذاكرة controller عبر التنقل؛ إنشاء مجهول يُراجع بالقائمة الجديدة ثم التفاصيل والنطاقات والأجزاء والمقادير واسم المنشئ وقت الكتابة. النتيجة تقول إن حدثًا مطابقًا أصبح متاحًا، ولا تدعي ارتباطًا قطعيًا بمعرّف عملية غير موجود. غياب الحدث أو تعدد المطابقات يبقي القفل. الأرشفة تتحقق من تواريخ أرشفة جميع الطلاب المستهدفين، والحذف من غياب القائمة و404 للتفاصيل مع جلسة مخولة؛403 لا يؤكد الحذف. تغيير اسم الحساب بعد الكتابة لا يفقد اسم المنشئ المحفوظ في العملية المعلقة.

شاشة السرد تقبل تفاصيل الحدث المختار فقط وتمنع الإجراء على تفاصيل اختيار سابق؛ إعادة تحميل المصالحة لا تستدعي محمل التفاصيل القديم بعد اختيار حدث جديد. المسودة تحفظ في الذاكرة، مع نسخة مستقلة وعزل الحساب والجهة، وتستمر عبر التنقل داخل controller الحالي. لا تحفظ بعد إنهاء العملية أو إعادة تشغيل التطبيق، ولا تغلق التخزين المشفر أو طابور العمل دون إنترنت فيW10.

## ملفات المرحلة

المخزون البرمجي34 ملفًا:24 جديدًا و10 محدثة. وثائق المرحلة الخمس تجعل مخزون الإغلاق39 ملفًا:25 جديدًا و14 محدثة. لا تغيير اعتماديات أو lockfile أو أصول المصحف أو سياسة القرآن المشتركة.

| النوع | الملفات |
|---|---|
| قواعد جديدة | [dayCompensation.ts](../../mobile/src/domain/dayCompensation.ts)، [narrationManagement.ts](../../mobile/src/domain/narrationManagement.ts)، [passingManagement.ts](../../mobile/src/domain/passingManagement.ts) |
| خدمات جديدة | [dayCompensationApi.ts](../../mobile/src/services/dayCompensationApi.ts)، [narrationManagementApi.ts](../../mobile/src/services/narrationManagementApi.ts)، [passingManagementApi.ts](../../mobile/src/services/passingManagementApi.ts) |
| شاشات جديدة | [NarrationManagementScreen.tsx](../../mobile/src/screens/NarrationManagementScreen.tsx)، [PassingManagementScreen.tsx](../../mobile/src/screens/PassingManagementScreen.tsx) |
| شاشات محدثة | [SessionManagementScreen.tsx](../../mobile/src/screens/SessionManagementScreen.tsx)، [SupervisorDashboardScreen.tsx](../../mobile/src/screens/SupervisorDashboardScreen.tsx): مدخل التعويض والسجل والسياسة وفق المنح |
| مكونات تعويض جديدة | [DayCompensationDialog.tsx](../../mobile/src/components/compensation/DayCompensationDialog.tsx)، [CompensationPolicyDialog.tsx](../../mobile/src/components/compensation/CompensationPolicyDialog.tsx) |
| مكونات سرد جديدة | [NarrationCreateDialog.tsx](../../mobile/src/components/narration/NarrationCreateDialog.tsx)، [NarrationRangeEditor.tsx](../../mobile/src/components/narration/NarrationRangeEditor.tsx)، [NarrationStudentDialog.tsx](../../mobile/src/components/narration/NarrationStudentDialog.tsx) |
| مكونات اجتياز جديدة | [PassingStudentPartsDialog.tsx](../../mobile/src/components/passing/PassingStudentPartsDialog.tsx)، [PassingAttemptReportDialog.tsx](../../mobile/src/components/passing/PassingAttemptReportDialog.tsx) |
| ملاحة محدثة | [NativeDashboard.tsx](../../mobile/src/NativeDashboard.tsx)، [dashboardNavigation.ts](../../mobile/src/domain/dashboardNavigation.ts) |
| وحدات جديدة | [dayCompensation.test.ts](../../mobile/tests/dayCompensation.test.ts)، [narrationManagement.test.ts](../../mobile/tests/narrationManagement.test.ts)، [passingManagement.test.ts](../../mobile/tests/passingManagement.test.ts) |
| وحدات محدثة | [management.test.ts](../../mobile/tests/management.test.ts)، [managementNavigation.test.ts](../../mobile/tests/managementNavigation.test.ts) |
| خادم محدث | [server/index.js](../../server/index.js)، [narrationPreparation.js](../../server/services/narrationPreparation.js): تفويض المعاينة والإنشاء للحاسب نفسه |
| مسار قراءة جديد | [narrationPreparationRoutes.js](../../server/routes/narrationPreparationRoutes.js) |
| اختبارات جذر محدثة | [narrationPreparation.test.js](../../tests/narrationPreparation.test.js)، [narrationWorkflow.test.js](../../tests/narrationWorkflow.test.js): الحفاظ على تحقق النطاق والحاسب بعد تفويضه للخدمة |
| سيناريوهات جديدة | [nativeAdvancedGradingContracts.mysql.mjs](../../tests/nativeAdvancedGradingContracts.mysql.mjs)، [nativeAdvancedGradingUi.browser.mjs](../../tests/nativeAdvancedGradingUi.browser.mjs)، [nativeAdvancedGradingEmulator.mjs](../../tests/nativeAdvancedGradingEmulator.mjs) |
| بيانات وأداة عزل جديدتان | [nativeAdvancedGradingFixture.mjs](../../tests/fixtures/nativeAdvancedGradingFixture.mjs)، [isolated-advanced-grading-loader.mjs](../../tests/fixtures/isolated-advanced-grading-loader.mjs) |
| وثيقة جديدة وأربع محدثة | هذا التقرير، [الخطة](../native-conversion-plan.md)، [برومبت المتابعة](continuation-prompt.md)، [فهرس التحويل](README.md)، [دليل التطبيق](../../mobile/README.md) |

شواهد التنفيذ والسجلات والصور نواتج مستقلة عن هذه الملفات البرمجية، ولا تُحسب تغييرات المصحف السابقة ضمن المرحلة.

## التحقق وحدوده

| الدليل الفعلي في14 أكتوبر2026 | النتيجة |
|---|---|
| الوحدات والأنواع وLint |383 اختبار تطبيق اجتازت؛ منها35 للتعويض و38 للسرد و29 للاجتياز. [TypeScript وLint النهائيان](../../mobile/evidence/advanced-grading-final-types-lint.log) اجتازا بعد إصلاح سباق اختيار الحدث والمصالحة. لا يثبت Node تخزينًا أو جهازًا فعليًا. |
| JavaScript/Hermes الحالي | تصدير Android وiOS اجتاز بعد آخر إصلاح شاشة؛ [السجل](../../mobile/evidence/advanced-grading-mobile-final-build.log). لا APK جديد أو IPA أو بناءiOS أصلي. |
| عقود HTTP/MySQL | [134 تحققًا](../../outputs/native-conversion/advanced-grading-contracts.json):116 طلبHTTP و18 مجموعةSQL/سلوك،23 بصمة مصدر. الأهلية والتكرار والإلغاء والنقاط والمنح والحلقات والجهات، عدم كتابة المعاينة، وتطابق نطاقاتها وتقسيمها مع SQL، وسجلات النتائج التاريخية اجتازت. |
| Chromium الحالي | [40 مجموعة](../../mobile/evidence/advanced-grading-ui.json) في6 حالات320/390/1440 والثيمين،609 طلب واجهة و12 دخولًا،103 صور و298 بصمة مصدر ثابتة. اختبر الإنشاء والأرشفة والحذف للحدث الذي أنشئ فعلًا، وفقد الرد مع POST واحد ثم503 للقراءة ثم مصالحة ناجحة من أول قراءة متحققة. تنظيف API والمتصفح والجلسات اجتاز. |
| فحص الجذر | السلسلة الكاملة [توقفت عند7 أخطاءno-undef](../../outputs/native-conversion/advanced-grading-root-verify.log) فيسكربتoutputs سابق خارج التحويل. [782 اختبارًا](../../outputs/native-conversion/advanced-grading-root-tests-current.log) و[audit بلا ثغرات](../../outputs/native-conversion/advanced-grading-root-audit.log) و[بناء8.06 ثانية](../../outputs/native-conversion/advanced-grading-root-build.log) اجتازت منفصلة. لا استثناء للملف أو تعطيل القاعدة. |
| تدقيق التطبيق | لا يزال advisory واحد لـnode-forge يظهر في5 حزم عالية الخطورة ضمن أدواتExpo؛ audit وverify الكامل غير مجتازين، دونforce أو تخفيضExpo أو تغيير lockfile. |
| Android المحاكى الحالي | دليل مركّب محدود من [الجزء الأساسي](evidence/native-advanced-grading-emulator-core.json) و[متابعة الأرشفة](evidence/native-advanced-grading-emulator-archive.json) و[الذيل النهائي](evidence/native-advanced-grading-emulator.json):42 سجل تحقق ناجحًا،33 تسمية تحقق فريدة،202 طلبHTTP ملحوظًا من التطبيق، و45 طلب تهيئة مستقلة،26 صورة مطابقة للبصمات تشمل صورتَي موضع توقف الأداة. كل تشغيل يثبت300 بصمة قبل/بعد؛299 ملف تطبيق وخادم وfixture متطابقة بين الأجزاء الثلاثة ومع المصدر الحالي، باستثناء أداة الفحص نفسها. [التدقيق المستقل](../../outputs/native-conversion/advanced-grading-emulator-integrity.json) يثبت النطاق؛ ليس رحلة واحدة كاملة ناجحة. |
| الأجهزة والبناء الأصلي | لا دليلAndroid فعلي أوiPhone، ولا بناءiOS أصلي. APK المستخدم development client تاريخي معMetro للمصدر الحالي؛ لم يُنشأ APK جديد لهذه المرحلة. |

[ملخص الإغلاق](../../mobile/evidence/advanced-grading-validation.json) يربط الأدلة الحالية وحدودها ومخزون الملفات؛ [سلامة الملفات والشواهد](../../mobile/evidence/advanced-grading-artifact-integrity.json) تحفظ بصماتها وحماية خط الأساس بصورة مستقلة عن أدلة المراحل السابقة.

احتُفظ بثلاث محاولات متصفح فاشلة داخل`priorAttempts`؛ الأولى افترضت وجهًا كاملًا بينما المعاينة الصحيحة0.5، والثانية كشفت تنفيذ الأرشفة على تفاصيل الحدث السابق، والثالثة كشفت بقاء نافذة المصالحة بعد نجاح القراءة بسبب محمل قديم ألغي. صحح الفحص الأول مقارنة القيم الفعلية، وأصلح التطبيق السباقين، ثم اجتازت رحلة متصفح جديدة كاملة؛ لم تُجمع نجاحات المحاولات الفاشلة في الدليل النهائي. العقود تحتفظ كذلك بمحاولاتها السابقة، بما فيها تصحيح قراءة شكل`juzParts` من العقد الحالي دون تغيير معيار مقدارها.

بقيت النتيجة العامة للجزء الأساسي من Android `failed` رغم19 سجل تحقق ناجحًا و89 طلبًا و14 صورة: توقف الفاحص عند اسم اختيار يوم السرد دون التاريخ الموجود في label الفعلي. وبقيت متابعة الأرشفة `failed` رغم14 سجلًا ناجحًا و68 طلبًا و9 صور: حارس إدخال الأداة منع اسمًا يحوي حرفR مكررًا قبل أي كتابة، كي لا يفعّل اختصار إعادة تحميل development client. الذيل النهائي اجتاز9 سجلات و45 طلبًا و3 صور وخرج0؛ احتفظ بمحاولاته الخمس السابقة. الأجزاء الثلاثة قواعد اصطناعية جديدة مستقلة بمصدر تطبيق ثابت؛ يشمل الدليل الإنشاء الكامل واليدوي، أرشفة وحذف الحدث المنشأ نفسه، الأرشفة الجزئية والكاملة والنقاط، الاستعادة الباردة للمدير والإداري وسحب المنحة403، منحة السرد وحدها ونطاق المشرف وتعويض القرآن دون منحة أسبوعي، ورفض تنفيذ الطالب409. التنظيف نجح في كل جزء دون لمسSQLCipher أوالمحاكي5560؛ لا توصف النتيجة بأنها رحلة Android كاملة واحدة ناجحة.

في فقد رد إنشاء اختبار الفرع على Android وصلPOST واحد إلى المسار ونفذSQL؛ حُجبت محاولة نقل تلقائية إضافية قبلrouting، ثم فشلت قراءة المصالحة503 ونجحت قراءة لاحقة لنفس الأجزاء دونPOST تطبيق ثانٍ. إنشاء اختبار الحافظ لاحقًا عملية منفصلة. هذه النتيجة مستخرجة من طلباتHTTP الملحوظة وفحوصSQL الموثقة في [التدقيق](../../outputs/native-conversion/advanced-grading-emulator-integrity.json)؛ الجزء الأساسي توقف قبل نسخ مصفوفة حقن الفشل، فلا يُدّعى وجودها فيه أو ضمان نقل HTTP مرة واحدة على كل شبكة.

أداة الاختبار تحجب مزودWhatsApp قبل تهيئةChromium/client الخارجي؛ سجلت العقود5 محاولات تهيئة محجوبة، والمتصفح الحالي14، وأجزاءAndroid الثلاثة2 و4 و2. مسارات التطبيق وMySQL وإشعارات الحساب محلية حقيقية، وهذا الحاجز لا يثبت تسليمWhatsApp. `messageQueued` يعني إضافة البداية للمعالجة فقط، ولا يوجد إيصال قراءة للتواصل التلقائي بعد الإنشاء والأرشفة. لم يضف التطبيق واجهة إعادة إرسالAPI-only؛ لا يدعي غياب إعادة النقل التلقائي على كل شبكة.

SQL نفذ في قواعد اصطناعية محلية للفحوص فقط، دون تعديل مخطط إنتاجي أو إرسال خارجي أو نشر أوcommit أوpush. [تقرير الملكية](../../outputs/native-conversion/native-advanced-grading-mysql-runtime.json) أصبح`status: stopped`: تحققSQL من الهوية والملكية وصفر جلسات في26 قاعدة مصادقة وصفر اتصالات أخرى، ثم أُقرSHUTDOWN وأثبت فحص نظام مستقل خروج العمليتين المملوكتين وتحرير3310. كل القواعد وdatadir محفوظة دون حذف، ولم تُمس عمليتاMySQL الأخريان. لا تفترض أن3310 يعمل في المرحلة التالية. تغييرات المستخدم للمصحف والمكونات المشتركة محفوظة.

مراجعة AGENTS: اجتازت.
