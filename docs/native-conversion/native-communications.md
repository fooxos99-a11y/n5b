# نقل الأخبار والإشعارات

تنفيذ محلي بتاريخ 15 أكتوبر 2026. أُغلقت W06-33 وW06-34 بعد تحقق التطبيق والعقود والمتصفح ورحلة Android جديدة كاملة وتدقيق المصدر والصور والتنظيف. الإجمالي **60 خطوة done من196، والمتبقي136**؛ W06 منجز29 من41. يبقى W07-16 verify لغياب وجهة الإشعار من العقد. مصدر الموقع والخادم وshared وسياسة تنفيذ القرآن عند المشرف محفوظة؛ نجاح هذه المرحلة لا يعني نجاح التحقق الكامل أو انتهاء التحويل.

## السلوك المنقول

| الوظيفة | السلوك وحدوده |
|---|---|
| إدارة الأخبار | إنشاء وتعديل وحذف وإخفاء وإظهار ثمانية أخبار كحد أقصى؛ العنوان والنص ولونه والصورة الاختيارية وبداية العرض ونهايته والحلقات المستلمة. البحث وحالات التحميل والفراغ والخطأ والتعارض والتأكيد والرجوع تستخدم المكونات المشتركة. |
| جمهور الخبر | بلا حلقات يعني الجميع، والحلقات المحذوفة لا توسع الجمهور تلقائيًا. التخصيص القديم legacyStudentIds محفوظ في الإجراءات التي لا تحرر الخبر؛ حفظه من المحرر يستبدله بالحلقات المختارة مع تنبيه، كما الموقع. |
| صور الأخبار | PNG وJPEG وWebP، حتى 5 MiB و7 ملايين محرف للـdata URI، مع حارس إجمالي الطلب 16 MiB. الخادم يتحقق من الصورة ويحولها إلى WebP بعرض أو ارتفاع أقصاه 1400، ثم يطبق حد 5 ملايين محرف للمحتوى المعالج. إلغاء منتقي النظام يبقي المسودة. لا اعتماديات جديدة أو تغيير لحد صور المتجر. |
| عرض الطالب | الخبر الموجه والفترة والإخفاء يقررها الخادم. أُضيف textColor الذي كان يهمله decoder، ويُعاد استخدام NewsArtwork في الإدارة والطالب. عند غياب الصورة أو فشل عرضها تتباين الخلفية مع لون النص؛ الصورة الصحيحة تحتفظ بتظليلها الحالي. لا إغلاق لمعيار المستوى والمحفوظ في W07-02. |
| إرسال الإشعارات | اختيار فئات الطلاب والمشرفين والإداريين والمديرين، أو حلقات، أو أشخاص، مع عدّ اتحاد المستلمين دون تكرار. العنوان هو اسم نخب الحالي كما الموقع، والنص حتى 4000 محرف. |
| السجل والمستلمون | آخر 100 إرسال، والمرسل والتاريخ وعدد المستلمين والقراءات وحالات push sent/pending/failed وتفاصيل المستلمين. هذه حالات الخادم؛ لا تعني وصولًا فعليًا إلى جهاز أو تشغيل worker ضمن الفحص. |
| صندوق الحساب | إشعارات هوية الحساب الموثقة فقط، وتعليم إشعار أو المجموعة كمقروء، مع COALESCE في الخادم لتثبيت وقت القراءة عند التكرار. الإدارة والصندوق يعيدان استخدام مكونات المحتوى والمستلمين. |

## الجلسة والصلاحيات والحفظ غير المؤكد

الأخبار تحتاج منحة settings، وإدارة الإشعارات تحتاج notifications. لا منحة news أو علم newsSectionEnabled أو notificationsSectionEnabled جديد. الصندوق عملية ذاتية للأدوار الأربعة ويظل منفصلًا عن منحة إدارة الإرسال. المنح والهوية والجهة تأتي من جلسة الخادم الحالية؛ لا يفتح الطالب شاشات الإدارة.

حراس الخدمات تفحص الحساب والدور والجهة والمنحة قبل الطلب وبعده. controller نفسه مرتبط بعنوان API الموثوق ويُلغي الطلبات عند تغيير epoch الجلسة؛ الأخبار تضيف عنوان API إلى مفتاح نطاقها صراحة. حوارات الأخبار وبياناتها مربوطة بنسخة الخدمة والنطاق، والإشعارات تعيد تركيب محتواها عند تبديل factory أو snapshot الجلسة. رد متأخر أو catch قديم لا يعرض بيانات الحساب السابق أو يحرر عملية السياق الجديد. 401/403 يحجب المحتوى المحمي حتى قراءة أو جلسة جديدة مصرح بها.

حفظ الأخبار يقارن أحدث snapshot ثم يرسل revision؛ الخادم يحدث الصف بشرط revision ذري، فنجاح حفظ متزامن يجعل الآخر409. يحتفظ العميل بهدف الحفظ في ذاكرة controller؛ فقد الرد يمنع PUT جديدًا حتى تطابق revision والمحتوى المحددين، وقراءة فاشلة أو تعارض لاحق لا يثبت عدم الحفظ. رد معروف لصورة جديدة يثبت ناتج التحويل ثم تُقرأ النسخة نفسها للتحقق.

**قيد الصورة غير المؤكدة:** إذا ضاع رد حفظ صورة جديدة بعد تحويل PNG إلى WebP، لا يملك العميل بصمة تحويل يمكن مطابقتها قطعًا. تبقى العملية مقفولة بدل تخمين نجاح صورة مشابهة أو إعادة PUT. اختبار الوحدة يثبت هذا الحد؛ تعافي فقد الرد في المتصفح يغطي تعديل النص مع صورة محفوظة أو بلا صورة جديدة، ولا يحمل دليله إلى تحويل مجهول. تغيّر لاحق يزيل تطابق الهدف قد يبقي قفل الأخبار كذلك. هذه ذاكرة فقط؛ لا إغلاق W10 أو ضمان مصالحة دائمة عبر قتل العملية.

الإشعارات تحفظ UUID مع نسخة حمولة ثابتة ومجمدة قبل POST في ذاكرة controller، وتمنع تغيير الرسالة والمستلمين أثناء النتيجة المجهولة. إعادة فتح الشاشة أو إنشاء factory أخرى لا تنشئ UUID جديدًا؛ إعادة المحاولة ترسل الحمولة نفسها، وdedupe_key في الخادم يعيد الإرسال السابق. لا إعادة تلقائية بUUID جديد، ولا ادعاء بقاء الأمر المعلق بعد قتل العملية أو مزامنة خلفية. استعادة SecureStore في Android تختبر الجلسات وحالة القراءة المحفوظة في SQL، لا بقاء pending الإرسال في ذاكرة عملية انتهت.

العقد الحالي للصندوق يعيد id/title/body/createdAt/isRead دون destination. لم تُخترع وجهة من عنوان أو نص الإشعار؛ W07-16 يبقى verify، وW11-11 وتسجيل APNs/FCM واستقبال push والأجهزة الفعلية تبقى مفتوحة.

## التحقق والشواهد

| النطاق | النتيجة والشاهد |
|---|---|
| التطبيق | [638 اختبارًا والأنواع وLint وHermes](../../mobile/evidence/communications-mobile-verify.log) اجتازت، ثم فشل verify عند audit بخمس إصابات عالية ضمن أدوات Expo. منها 43 اختبار أخبار و36 إشعارات؛ لا تجمع الأعداد المستهدفة مرة أخرى فوق638. |
| Expo Doctor | [20/21، exit1](../../mobile/evidence/communications-doctor.log): المتوقع expo~57.0.29 والمثبت57.0.28؛ لا تعديل اعتماديات أوlockfile أو استثناء للفحص. |
| HTTP/MySQL | [154 تحققًا](../../outputs/native-conversion/communications-contracts.json):147 تحقق استجابة HTTP و7 SQL/محلية، مع153 طلبًا فعليًا و24 بصمة مصدر. شملت النجاح والفشل والصلاحيات والجهات وسحب المنحة وrevision المتزامن والصور والتواريخ وlegacy والجمهور المحذوف وUUID المتزامن وفقد الرد وقراءة الحساب الآخر. |
| المتصفح النهائي | [24 مجموعة في6 تنويعات](../../mobile/evidence/communications-ui.json)، على320/390/1440 في الثيمين، و53 صورة فريدة و527 طلب HTTP. التصدير يستعمل App ومكوناته وخادم HTTP وMySQL الحقيقيين؛ جلسة المتصفح وpending في الذاكرة فقط. المصدر قبل/بعد متطابق، ولا تجاوز أفقي أو قص حقول أو أخطاء JavaScript. |
| تدقيق المتصفح والعقود | [تدقيق مستقل](../../outputs/native-conversion/communications-browser-integrity.json) يقارن المصدر الحالي وبصمات الصور وأحجامها وتوقيع PNG وفك pixels والتنظيف. بيانات App.json/app.json هي alias لملف واحد على Windows؛ الخام346 مدخلًا، والعدد الموحد345 ملفًا في المتصفح. |
| Android النهائي | [رحلة ثالثة كاملة جديدة](evidence/native-communications-emulator.json):27 تحققًا و21 صورة فريدة و122 طلب تطبيق HTTP، مع20 طلب تهيئة منفصلة. شملت منتقي النظام وإلغاءه والصورة وCRUD، ثلاث استعادةSecureStore للمدير والإداري والطالب، سحب المنح وحجب المحتوى والملاحة، UUID واحد بعد رد201 مفقود ثم200، قراءة الطالب واستعادتها وعزل الطالب الآخر والإداري بلا منح.346 مدخل مصدر قبل/بعد متطابقة=345 ملفًا فريدًا. المحاكيAPI35/5584 وAPK المتجر المحفوظ معMetro الحالي8097؛ لا بناءAPK جديد أو دليل جهاز فعلي. |
| تدقيق الشواهد الثلاثة | [التدقيق النهائي المستقل](../../outputs/native-conversion/communications-harness-integrity.json) اجتاز العقود والمتصفح وAndroid مقابل المصدر الحالي؛24/345/345 ملفًا فريدًا،344 مشتركة بين تقريرين على الأقل، و74 صورة فريدة مفكوكة بالكامل مع مطابقة الأحجام والبصمات وتوقيعPNG. لا يحمل نجاح تقرير تاريخي إلى مصدر تغيّر. |
| حماية العمل والبناء | [تدقيق الملفات النهائي](../../mobile/evidence/communications-artifact-integrity.json):34 ملفًا=23 جديدًا+11 محدثة، و12748 ملفًا محميًا مقابل baseline12765، و6 استثناءات بالاسم دون قراءة محتواها. حذف ملفي المصحف القائم محفوظ، وملفاAPK وتقريرا بنائهما مطابقان للشاهد السابق. لا ملفات غير متوقعة أو تعديل للمستخدم. |
| القواعد والإيقاف | [تدقيقSQL للقراءة فقط](../../outputs/native-conversion/communications-database-audit.json) شمل18 قاعدة هذه المرحلة و42 قاعدة المتجر الموثقة:صفر جلسات وصفر اتصالات مستخدم أخرى. حُفظت263 قاعدة إجمالًا؛203 أقدم لم تُقرأ جداولها. [الملكية والإيقاف](../../outputs/native-conversion/native-communications-mysql-runtime.json) يثبتان PID/config/datadir الفعليين ثمSHUTDOWN رشيقًا وخروج العمليتين وتحرير3310؛3312/PID11980 دون تغيير. لم تُهيأ قاعدة محفوظة أوتُحذف. |
| الجذر | [verify](../../outputs/native-conversion/communications-root-verify.log) اجتاز الامتثال ثم توقف عند7 أخطاء no-undef القائمة في outputs/feature-presentation/render-site-statistics.mjs. [782 اختبارًا](../../outputs/native-conversion/communications-root-tests.log) و[audit0](../../outputs/native-conversion/communications-root-audit.log) و[بناء26.25 ثانية](../../outputs/native-conversion/communications-root-build.log) اجتازت مستقلة؛ السلسلة الكاملة ليست ناجحة. |

المحاولة الأولى للمتصفح توقفت عند فحص SQL لحالة القراءة قبل اكتمال الطلب. الثانية توقفت عند افتراض disabled بينما React Native Web يطبق editable=false بصفة readonly. صُحح انتظار SQL والتحقق من قابلية التحرير في أداة الفحص؛ الرحلة الثالثة كاملة جديدة اجتازت. المحاولتان محفوظتان في priorAttempts مع failed والتنظيف، ولا تحمل نجاحاتهما إلى الشاهد النهائي.

[محاولة Android الأولى](evidence/native-communications-emulator-prior-c24115d4fe8c46f7.json) توقفت بعد3 فحوص عند اسم جهة اختبار تجاوز VARCHAR32؛ قُصر الاسم في الأداة دون تغيير التطبيق أو المخطط. [الثانية](evidence/native-communications-emulator-prior-9d9e438af6ff44ac.json) توقفت بعد17 فحصًا و12 صورة و56 طلب تطبيق عند حارس توقع actor لمسار public-settings العام؛ رصدت auth/session200 للحساب وpublic-settings304 بلاactor. صُحح الحارس إلى هوية جلسة محددة مع استجابة إعدادات200/304 للجهة وانتهاء التحميل، ثم بدأت رحلة كاملة جديدة. نتيجتا الفشل والتنظيف محفوظتان؛ لا يحمل نجاح فقد الرد أو الصور فيهما إلى الرحلة النهائية، ولا يُنسب فشل الفاحص إلى التطبيق.

توقف [حارس تدقيق القواعد الأول](../../outputs/native-conversion/communications-database-audit-prior-scope-guard.json) لأن الأداة افترضت أن60 قاعدة المتجر والمرحلة هي كل قواعد المحرك، بينما توجد203 قواعد مراحل أقدم محفوظة. لم ينفذ تعديلًا أوإيقافًا. التدقيق النهائي اشتق أسماء القواعد الستين المحددة من تقاريرها الأصلية، وتحقق من بقائها وعدّ جلساتها فقط؛ بقية القواعد بقيت دون قراءة جداولها، ثم تحقق غياب الاتصالات قبل إيقاف المحرك المملوك.

أصلح التنفيذ تباين الخبر بلا صورة قبل الرحلة النهائية، وأُصلح اعتماد useMemo الزائد في الربط، وحدّث اختبار التنقل توقعه ليتضمن القسمين الجديدين. محاولات التحقق التطويرية الفاشلة لا تعد دليل إغلاق. لا إخفاء لأخطاء التحقق الكامل المعروفة.

## الملفات والتشغيل

| النوع | الملفات |
|---|---|
| أخبار جديدة | [NewsManagementScreen.tsx](../../mobile/src/screens/NewsManagementScreen.tsx)، [NewsEntryDialog.tsx](../../mobile/src/components/news/NewsEntryDialog.tsx)، [NewsArtwork.tsx](../../mobile/src/components/news/NewsArtwork.tsx)، [newsManagement.ts](../../mobile/src/domain/newsManagement.ts)، [newsManagementApi.ts](../../mobile/src/services/newsManagementApi.ts)، [newsImagePicker.ts](../../mobile/src/services/newsImagePicker.ts)، [newsImagePicker.web.ts](../../mobile/src/services/newsImagePicker.web.ts) |
| إشعارات جديدة | [NotificationsManagementScreen.tsx](../../mobile/src/screens/NotificationsManagementScreen.tsx)، [AccountNotificationsScreen.tsx](../../mobile/src/screens/AccountNotificationsScreen.tsx)، [NotificationAudiencePicker.tsx](../../mobile/src/components/notifications/NotificationAudiencePicker.tsx)، [NotificationContent.tsx](../../mobile/src/components/notifications/NotificationContent.tsx)، [notifications.ts](../../mobile/src/domain/notifications.ts)، [notificationsApi.ts](../../mobile/src/services/notificationsApi.ts) |
| اختبارات جديدة | [newsManagement.test.ts](../../mobile/tests/newsManagement.test.ts)، [notifications.test.ts](../../mobile/tests/notifications.test.ts)، [studentNewsPresentation.test.ts](../../mobile/tests/studentNewsPresentation.test.ts)، [fixture](../../tests/fixtures/nativeCommunicationsFixture.mjs)، [العقود](../../tests/nativeCommunicationsContracts.mysql.mjs)، [المتصفح](../../tests/nativeCommunicationsUi.browser.mjs)، [Android](../../tests/nativeCommunicationsEmulator.mjs) |
| أدوات تدقيق جديدة | [الشواهد](../../scripts/check-native-communications-evidence.mjs)، [حماية الملفات](../../scripts/check-native-communications-artifacts.mjs) |
| ربط وعرض محدث | [NativeDashboard.tsx](../../mobile/src/NativeDashboard.tsx)، [dashboardNavigation.ts](../../mobile/src/domain/dashboardNavigation.ts)، [studentDashboard.ts](../../mobile/src/domain/studentDashboard.ts)، [AccountScreen.tsx](../../mobile/src/screens/AccountScreen.tsx)، [StudentDashboardScreen.tsx](../../mobile/src/screens/StudentDashboardScreen.tsx) |
| اختبارات تنقل محدثة | [managementNavigation.test.ts](../../mobile/tests/managementNavigation.test.ts)، [management.test.ts](../../mobile/tests/management.test.ts) |
| وثائق | هذا التقرير جديد، والخطة وcontinuation-prompt وفهرس التحويل وREADME التطبيق محدثة عند الإغلاق. |

تشغيل العقود والمتصفح والمحاكي من جذر نخب يحتاج Node24.19 أو أحدث وloader العزل tests/fixtures/isolated-advanced-grading-loader.mjs وMYSQL_HOST=127.0.0.1 وMYSQL_PORT=3310. يؤكد المتصفح والمحاكي تجميد المصدر عبر NATIVE_COMMUNICATIONS_SOURCE_FROZEN=1. لا تشغلهما قبل التحقق من تقرير الملكية ومن PID/config/datadir والمنفذ الفعلي؛ القواعد اصطناعية جديدة فقط دون إعادة تهيئة datadir أو القواعد المحفوظة. أدوات الفحص تحجب تهيئة WhatsApp الخارجية؛ لا worker إشعارات أو إرسال خارجي.

شاهد المتجر السابق وAPK وتقرير بنائه محفوظة. لا تعديلات خادم أوshared أوموارد المصحف أوdependencies/lockfiles، ولا SQL إنتاجي أو نشر أو commit أوpush. لا Android فعلي أوiPhone أوبناءiOS أصلي أوAPI36، ولا دخول بارد دون اتصال أوإغلاقW10.

ملخص الإغلاق القابل للقراءة آليًا: [communications-validation.json](../../mobile/evidence/communications-validation.json). فشل verify الكامل عند العوائق السابقة محفوظ؛638 و782 وحدات مستقلة ناجحة، ولا تدّعي هذه الشواهد معالجة ثغراتExpo أوDoctor أوLint السابق.

مراجعة AGENTS: اجتازت.
