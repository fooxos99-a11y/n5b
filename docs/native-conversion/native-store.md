# نقل المتجر والشراء المحلي

تنفيذ محلي بتاريخ 14 أكتوبر 2026؛ أُغلقت W06-30 و W06-31 و W06-32 و W07-13 و W07-14 وفق واجهات الموقع وخادمه الحاليين وشواهد المصدر النهائي والتنظيف. الإجمالي **58 من 196 خطوة done** و 138 متبقية؛ W06 منجز 27 من 41 و W07 منجز 3 من 18. لا يغلق هذا الجزء حساب المدير أو الطالب كاملًا أو مراحل W10 و W11.

كشف Android خللًا فعليًا في AppGate عند العودة من اختيار الصورة، ثم فشلت الرحلة الرابعة عند الرجوع الفعلي إلى Launcher. أُصلحت عودة النشاط وتغيّر إعداد الرجوع عبر app.json؛ APK الجديد والمتصفح السادس و Android السادس اجتازت على المصدر النهائي. شواهد المحاولات السابقة ونتائج فشلها محفوظة مستقلة؛ لا تُجمع نجاحاتها مع الرحلة النهائية.

## السلوك المنقول

| الوظيفة | السلوك وحدوده |
|---|---|
| منتجات الإدارة | إنشاء وتعديل الاسم والسعر الصحيح بالنقاط، مخزون محدد أو غير محدود، والصورة الاختيارية؛ إظهار وإخفاء المنتج وحذفه حذفًا منطقيًا. لا وصف أو تصنيف أو فلاتر جديدة غير موجودة في الموقع. |
| الصورة | PNG أو JPEG أو WebP عبر `File.pickFileAsync` من expo-file-system المثبتة أصلًا؛ إلغاء الاختيار لا يغير النموذج. نسخة المتصفح تستعمل اختيار ملف و FileReader فقط. تعديل صورة العرض غير المتغيرة يحذف `imageData` من PUT ليحفظ الخادم الأصل، ولا يستبدله بالنسخة المحسنة. |
| الحجم والرفع | حد الصورة الخلفي المعلن 10 MiB لا يرفع حد محلل JSON العام الحالي، وهو 1 MiB؛ حارس الرفع المحلي يترك 4096 بايت لبقية الحقول ويمنع صورة base64 تتجاوز بقية الطلب. يعرض 413 كخطأ تحقق معروف، ولا يفسره نتيجة حفظ مجهولة. لا تغيير في حدود الخادم أو إضافة مكتبة. |
| طلبات الطلاب | تعرض الإدارة الطلبات المعلقة فقط كما الموقع؛ قبول أو رفض واحد محروس. الخادم يحتفظ بسجل الطلب النهائي وتوقيته؛ الرفض يعيد رصيد المتجر والمخزون المحجوز وخصم الترتيب الفعلي المسجل، وفق عقده الحالي. لا تسليم أو حذف طلب أو تبويب سجل مصطنع. |
| الإعدادات | تغيير `storeEnabled` و`storePurchaseDeductsRanking` بمنحة المتجر نفسها، مع قراءة أحدث إعدادين قبل PATCH. الإغلاق يعطل خصم الترتيب ويخفي المنتجات من الطالب، وتبقى مراجعة الطلبات متاحة للمخول. لا PUT كامل للإعدادات ولا مسح لحقول أخرى. |
| متجر الطالب | المنتجات المتاحة وصورها والسعر والمخزون ورصيد المتجر، مع حالات الفراغ والإغلاق وفشل القراءة. `null` في الرصيد يبقى «غير متاح»؛ لا يتحول إلى صفر أو أهلية شراء. |
| طلب الطالب | تأكيد شراء قطعة واحدة، وحفظ UUID والتاريخ والحمولة أولًا في الطابور المحلي قبل أي POST، مع حجز الرصيد والمخزون في الحالة المحلية. تعرض النتيجة «حُفظ الطلب محليًا» أو «أُرسل الطلب للمراجعة»، ولا تعني أي منهما قبول الإدارة. |
| المزامنة | UUID والتاريخ ومعرف المنتج ثابتة عند الإعادة؛ لا UUID جديد للعملية نفسها ولا خصم محلي ثان. يُمنع شراء جديد عند وجود `pendingSync` حتى مصالحة الطلب السابق؛ زر المزامنة متاح. الرصيد وحده لا يثبت قبول عملية مجهولة، و 409 أو 422 لاحقان لفقد الرد لا يثبتان عدم تنفيذها. |

تستخدم الشاشات `ActionButton` و`FormField` و`FormDialog` و`ConfirmDialog` و`ScreenLayout` المستوردة، مع بطاقات وصور وحوارات مستقلة قابلة لإعادة الاستخدام. تُعرض صورة تعذر رسمها بحالة مفهومة، دون تعطيل البطاقة أو إنشاء واجهة HTML داخل التطبيق.

## الهوية والصلاحيات والنتائج غير المؤكدة

الإدارة مرتبطة بمنحة `store` والعلم الفعّال `storeSectionEnabled`، والطالب يحتاج دوره الحقيقي و`storeEnabled`؛ علم قسم الإدارة لا يمنع متجر الطالب. مفتاح النطاق يجمع عنوان API الموثوق والجهة والدور ومعرف الحساب. `nativeSessionApiBase` يقرأ سجل controllers موثوقًا، ولا يقبل عنوان خدمة من جسم استجابة أو قيمة يضيفها المستهلك.

كل خدمة تتحقق قبل الطلب وبعده؛ العرض مرتبط بنسخة API ومفتاح النطاق، فلا يعرض حمولة سابقة أثناء التحميل أو الخطأ أو استبدال الخدمة. رفض 401 أو 403 أو `cancelled` يحجب بيانات الإدارة وحوارات المنتج والإعدادات والحذف حتى قراءة حديثة مصرح بها. رد متأخر من خدمة سابقة لا يحجب الجديدة أو يحرر عمليتها. اختيار الصورة نفسه محروس بملكية النموذج والسياق قبل `await` وبعده.

التعديل والتفعيل والحذف والقرار والإعدادات تقارن snapshot حديثة قبل الكتابة، ثم تتحقق من الأثر المحدد. العملية غير المؤكدة للإدارة محفوظة بذاكرة controller عبر إعادة إنشاء factory والرجوع. نجاح GET عام لا يحررها، و 403 أو إغلاق المتجر لا يعنيان حذف منتج. إنشاء مجهول بلا معرف مُردود، أو صورة محولة مجهولة بلا ack، يبقى محجوبًا لغياب دليل قطعي؛ لا يطابق منتجًا مشابهًا بالتخمين ولا يعيد POST. إذا عُرف المعرف من ack صحيح ثم فشلت قراءة الأثر، يمكن المصالحة بالمعرف والبيانات المحددة. هذه ذاكرة فقط وليست طابور إدارة دائمًا.

لا يوجد revision ذري لمنتجات المتجر أو إعداداته. القراءة الحديثة ترفض التغيير المعروف، لكنها لا تقفل السباق بين GET و PUT/PATCH، بما فيه تغيير المخزون أثناء شراء متزامن. الخادم يملك المعاملة وقفل الطالب والطلب والمنتج عند الشراء والقرار، ومعرف UUID يمنع تكرار الطلب نفسه؛ لا تُستنتج ضمانات نقل HTTP مرة واحدة من ذلك.

عودة نشاط اختيار الصورة تستخدم حارسًا مرتبطًا بـ epoch الجلسة. يمنع الطلبات المحمية أثناء الاختيار، ويفحص `auth/session` بعد العودة حتى عند إلغاء الاختيار أو فشله. يحتفظ بنفس snapshot عند بقاء الهوية والمنح، ويحجب نتيجة تغيّرهما أو بدء login/logout/cancel في الأثناء. عولجت عودة النشاط الخارجي دون تغيير سياسة الدخول البارد أو السماح بدخول بارد دون اتصال؛ 29 اختبارًا في `nativeForeground.test.ts` ضمن 557، والعودة من منتقي النظام أثبتتها رحلة Android النهائية.

## التخزين المحلي

الطالب يستخدم قاعدة SQLCipher مستقلة `nukhab-native-store-v1.db` ومفتاح SecureStore مستقل `sa.nukhab.app.store.key.v1` بخيار `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. لا تُفتح قاعدة تجربة W01 أو تعاد تهيئتها، ولا ينشأ مفتاح بديل عند وجود قاعدة المتجر وفقد المفتاح؛ يفشل الوصول بأمان إذا غاب SQLCipher أو فسدت الهوية أو الحالة المخزنة. لا تُكشف مفاتيح أو SQL أو أخطاء قاعدة خام في الواجهة.

المخطط المحلي يحفظ snapshot والطابور لكل نطاق في صف باستعلامات parameterized؛ الحفظ وتعديل قائمة العمليات داخل transaction على مقبض خاص مهيأ بالمفتاح، مع تتابع القراءة والكتابة. الحجز يُشتق من الأوامر المعلقة نفسها بعد الحفظ، ويشمل المخزون المحدود فقط. لا اتصال جديد بلا `PRAGMA key`. مساحة المتصفح في الذاكرة فقط، ولا تعد دليل SQLCipher أو استعادة بعد إغلاق عملية المتصفح.

قراءة الطالب تحاول مصالحة الطابور ثم تحميل كتالوج مصرح به. عند وجود عملية مجهولة يحتفظ المنسق بأساس الحجز السابق حتى يصل رد متحقق لمعرفها؛ لا يستبدله برصيد قد يكون خصم العملية بالفعل. فشل شبكة القراءة قد يرجع cache لنفس الحساب، أما رفض الصلاحية أو السياق أو استجابة غير صالحة فلا يعرض حمولة مخزنة كبديل. تعطيل المتجر يحجب المنتجات والرصيد ويحتفظ بالطلب المعلق.

هذا جزء محدود من الشراء المحلي المتاح حاليًا. لا دخول بارد دون إنترنت، ولا ترحيل Capacitor أو مسودة تسميع أو مزامنة عامة أو خلفية مضمونة؛ W10 كلها مفتوحة. لا endpoint لطلبات الطالب الخاصة أو حالة قبولها الحالية، فلا أُضيف سجل طلبات أو حالة قبول مخترعة. اختيار صور المتجر لا يغلق W11-12 العام أو أذونات الجهازين.

## مخزون الملفات

مقارنة [خط الأساس 5162 مسارًا](../../outputs/native-conversion/store-source-before.json) تحدد 38 ملف مصدر واختبار، منها 28 جديدًا و 10 محدثة؛ مع الوثائق الخمس بلغ المخزون 43 ملفًا، منها 29 جديدًا و 14 محدثة. التدقيق المستقل أكد بقاء 5147 مسارًا محميًا دون اختلاف، بما فيها الحذفان الأصليان. حماية APK وتقرير البناء التاريخيين إضافية وخارج خط الأساس. [سلامة الملفات والشواهد](../../mobile/evidence/store-artifact-integrity.json) تربط الحماية بالمخزون النهائي؛ ملفات الأدلة المولدة مستقلة عن هذا المخزون ولا تُحسب ككود جديد.

| النوع | الملفات |
|---|---|
| جديد؛ شاشتا المتجر | [StoreManagementScreen.tsx](../../mobile/src/screens/StoreManagementScreen.tsx)، [StudentStoreScreen.tsx](../../mobile/src/screens/StudentStoreScreen.tsx) |
| جديد؛ البطاقات والصور | [StoreProductCard.tsx](../../mobile/src/components/store/StoreProductCard.tsx)، [StoreProductImage.tsx](../../mobile/src/components/store/StoreProductImage.tsx)، [StoreOrderRow.tsx](../../mobile/src/components/store/StoreOrderRow.tsx) |
| جديد؛ الحوارات والعرض | [StoreProductDialog.tsx](../../mobile/src/components/store/StoreProductDialog.tsx)، [StoreSettingsDialog.tsx](../../mobile/src/components/store/StoreSettingsDialog.tsx)، [StorePurchaseDialog.tsx](../../mobile/src/components/store/StorePurchaseDialog.tsx)، [storePresentation.ts](../../mobile/src/components/store/storePresentation.ts) |
| جديد؛ العقود والطابور والصور | [storeManagement.ts](../../mobile/src/domain/storeManagement.ts)، [storePurchaseQueue.ts](../../mobile/src/domain/storePurchaseQueue.ts)، [storeImage.ts](../../mobile/src/domain/storeImage.ts) |
| جديد؛ API والمنسق | [storeManagementApi.ts](../../mobile/src/services/storeManagementApi.ts)، [studentStoreApi.ts](../../mobile/src/services/studentStoreApi.ts)، [storePurchaseCoordinator.ts](../../mobile/src/services/storePurchaseCoordinator.ts) |
| جديد؛ تخزين واختيار ملفات المنصتين | [studentStoreStorage.ts](../../mobile/src/services/studentStoreStorage.ts)، [studentStoreStorage.web.ts](../../mobile/src/services/studentStoreStorage.web.ts)، [storeImagePicker.ts](../../mobile/src/services/storeImagePicker.ts)، [storeImagePicker.web.ts](../../mobile/src/services/storeImagePicker.web.ts) |
| جديد؛ اختبارات التطبيق | [storeManagement.test.ts](../../mobile/tests/storeManagement.test.ts)، [storePurchaseQueue.test.ts](../../mobile/tests/storePurchaseQueue.test.ts)، [storeImage.test.ts](../../mobile/tests/storeImage.test.ts)، [storePresentation.test.ts](../../mobile/tests/storePresentation.test.ts)، [nativeForeground.test.ts](../../mobile/tests/nativeForeground.test.ts) |
| جديد؛ العقود ورحلات الواجهة و fixture | [nativeStoreContracts.mysql.mjs](../../tests/nativeStoreContracts.mysql.mjs)، [nativeStoreUi.browser.mjs](../../tests/nativeStoreUi.browser.mjs)، [nativeStoreEmulator.mjs](../../tests/nativeStoreEmulator.mjs)، [nativeStoreFixture.mjs](../../tests/fixtures/nativeStoreFixture.mjs) |
| محدث؛ الربط والمنح والهوية والنقل | [NativeDashboard.tsx](../../mobile/src/NativeDashboard.tsx)، [NativeAppGate.tsx](../../mobile/src/NativeAppGate.tsx)، [dashboardNavigation.ts](../../mobile/src/domain/dashboardNavigation.ts)، [nativeSession.ts](../../mobile/src/domain/nativeSession.ts)، [nativeApi.ts](../../mobile/src/services/nativeApi.ts) |
| محدث؛ اختبارات النقل والمنح الحالية | [nativeApi.test.ts](../../mobile/tests/nativeApi.test.ts)، [managementNavigation.test.ts](../../mobile/tests/managementNavigation.test.ts)، [management.test.ts](../../mobile/tests/management.test.ts) |
| محدث؛ إعداد الرجوع ومخرجات البناء | [app.json](../../mobile/app.json)، [build-android-debug.ps1](../../mobile/scripts/build-android-debug.ps1) |
| جديد؛ تقرير المرحلة | [native-store.md](native-store.md) |
| محدث؛ المتابعة والتشغيل | [الخطة](../native-conversion-plan.md)، [برومبت المتابعة](continuation-prompt.md)، [فهرس التحويل](README.md)، [README التطبيق](../../mobile/README.md) |

لم تتغير اعتماديات أو lockfiles أو أصول أو إعداد SQLCipher أو سياسة تنفيذ القرآن عند المشرف. لم تُمس تغييرات المصحف الحالية أو shared. تغيّر `predictiveBackGestureEnabled` إلى false، وأضيف `ArtifactName` و`ReportName` إلى helper البناء بقيم leaf محروسة. APK المحلي الجديد اجتاز وأُبقي APK والتقرير التاريخيان دون استبدال؛ هو development client يحتاج Metro وليس release أو إصدار متجر. W06-29 والتراجع العام خارج المرحلة.

## التحقق النهائي وحدوده

| الدليل | النتيجة وحدودها |
|---|---|
| الوحدات المستهدفة | 45 وحدة خدمات المتجر، و 36 للطابور، و 4 للعرض اجتازت، ثم 29 حالة للعودة من النشاط الخارجي. فحص root المستهدف 48 ضمن الفحص الكامل؛ لا تُجمع الفحوص المستهدفة كعدد إضافي فوق 557. |
| [فحص التطبيق النهائي بعد تغيير الرجوع](../../mobile/evidence/store-mobile-verify.log) | TypeScript و Lint و 557/557 اختبارًا دون فشل أو تخطي و Hermes اجتازت على config الجديدة؛ ثم audit فشل عند 5 إصابات عالية من node-forge وانتهى verify1. [557 السابقة قبلتغييرالرجوع](../../mobile/evidence/store-mobile-verify-before-back-fix.log) و[528 قبلإصلاحالمنتقي](../../mobile/evidence/store-mobile-verify-before-picker-fix.log) تاريخيتان منفصلتان. لا نجاح للسلسلة الكاملة. |
| Hermes الحالي بعد تغيير الرجوع | Android: `index-f81d61ea3ce50204f4f2a942ede1f33f.hbc`،4,887,838 بايت، SHA-256=`C9CF6CA5C317FE8AF81F533C621ECF813506AF36DE6B1021CDF8AABB5B39D826`؛ iOS: `index-9b2cd5629ccd8412f2001148850a7b25.hbc`،4,893,981 بايت، SHA-256=`1C5075D66B02F4168417EBB1404D23269DE2932D490A9FAAEA9F0FD8D7C4A63A`. الاسمان السابقان لايعنيان تطابق المحتوى؛ هذه الأحجام والبصمات الجديدة. تجميع JavaScript فقط، لا APK أو IPA أو تشغيل iPhone. |
| [Expo Doctor الحالي](../../mobile/evidence/store-doctor.log) | 20/21،exit1: عدمتطابق واحد بين expo المتوقع`~57.0.29` والمثبت`57.0.28`.21/21 السابقة تاريخية؛ لم تُغير الاعتماديات أو lockfile لتجاوزالناتج. |
| [العقود الفعلية](../../outputs/native-conversion/store-contracts.json) | 152 تحققًا اجتازت: 144 تحققًا من استجابات HTTP و 8 تحققات SQL أو محلية، وليست 152 طلب HTTP. تطابقت 27 بصمة قبل/بعد/حالية، مع منع الدور غير المخول والجهة الأخرى، والمنتجات والصور والحدود والقرار وفقد الرد و UUID والرصيد والمخزون وسجل الرفض. SHA-256=`57337D15A8E2229C5028CB371D135D1301F980E2C4758EF083E1E8047A674A87`. |
| [تحقق الجذر](../../outputs/native-conversion/store-root-verify.log) | فاحص AGENTS اجتاز؛ السلسلة توقفت عند 7 أخطاء no-undef القائمة في `outputs/feature-presentation/render-site-statistics.mjs` خارج التحويل. لم تُعطل قاعدة أو تُصلح ملفات العائق ضمن المتجر. |
| فحوص الجذر الحالية المنفصلة | [782 اختبارًا](../../outputs/native-conversion/store-root-tests.log)، و[التدقيق دون ثغرات](../../outputs/native-conversion/store-root-audit.log)، و[البناء في 15.85 ثانية](../../outputs/native-conversion/store-root-build.log) اجتازت الآن بأوامر مستقلة؛ لا تحوّل فشل السلسلة الكاملة إلى نجاح. |
| [المتصفح السادس النهائي الحالي](../../mobile/evidence/store-ui.json) | 38 مجموعة كاملة في 6 تنويعات و 83 صورة فريدة و 802 طلب HTTP للمتصفح.333 بصمة قبل/بعد/حالية متطابقة، وكل PNG وأحجامها وبصماتها سليمة؛ التدقيق مستقل من root. SHA-256=`1A6B2E74B071662584D0F72794114F7EE023D970A39D1C53E97A852AF91CD0D1`.805 تخص المتصفح الخامس التاريخي، لا الحالي؛ Node27 منفصلة. |
| خدمات التطبيق عبر Node | 27 طلب controller فعليًا ضمن دليل المتصفح، مع 3 طلبات تهيئة منفصلة؛ ذاكرة فقط، ولا يمثل SecureStore أو SQLCipher على الجهاز. |
| [Android السادس النهائي](evidence/native-store-emulator.json) | رحلة كاملة جديدة اجتازت 29 فحصًا و 20 صورة PNG و 207 طلبات تطبيق، مع 10 طلبات تهيئة مستقلة. تطابقت 333 بصمة قبل/بعد/حالية، منها 332 مشتركة مع المتصفح باستثناء أداة الرحلة. أثبتت منتقي النظام وقرارات الطلبات والرجوع الفعلي والمصالحة والطابور بعد force-stop بنفس UUID وقيد SQL واحد؛ محاكي API35 فقط. |
| [التنظيف وتدقيق القواعد](../../outputs/native-conversion/store-database-audit.json) و[ملكية MySQL](../../outputs/native-conversion/native-store-mysql-runtime.json) | 42 قاعدة محفوظة، `auth_sessions=0` واتصالات مستخدم أخرى صفر، ثم إغلاق MySQL3310 المملوك وتحرير منفذه. بقي MySQL3312 و PID11980 دون تغيير؛ أُوقفت API و Metro والمحاكي المملوكة وأُزيل reverse، مع حفظ AVD و datadir والقواعد. |
| [تدقيق الأدوات المستقل](../../outputs/native-conversion/store-harness-integrity.json) | النتيجة passed؛ سلامة صور المتصفح والمحاكي والمصدر والبناء والتقارير وأعلام cleanup متحققة؛ ملكية إيقاف MySQL يثبتها تقرير الملكية وتدقيق القواعد وملخص الإغلاق. [ملخص الإغلاق](../../mobile/evidence/store-validation.json) يجمع النتائج وحدودها، دون تحويل فشل verify أو Doctor إلى نجاح. |

[المحاولة السابقة للعقود](../../outputs/native-conversion/store-contracts-prior-63c0710e555d439c.json) بقيت failed عند توقع حقل undo غير الموجود في جسم الاستجابة. تصحيح أداة العقود يعتمد العقد الحقيقي ولا ينقل نجاحًا منها للدليل الحالي. محاولة المتصفح الأولى فشلت بعد 5 تحققات عند عنوان الإداري بدل الطالب، والثانية عند توقع زر المتجر؛ محفوظتان في [الأولى](../../mobile/evidence/store-ui-prior-222cc31a3b76487d.json) و[الثانية](../../mobile/evidence/store-ui-prior-b1b1eacaf6244025.json). تصحيح افتراضات الفاحص لم يغير التطبيق.

المحاولة الثالثة [raw passed](../../mobile/evidence/store-ui-prior-01e8b6bda10a4b8a.json) لا تصلح دليل إغلاق: [تدقيق الصور المستقل](../../outputs/native-conversion/store-browser-image-integrity-failed-01e8b6bda10a4b8a.json) وجد 8 بصمات غير مطابقة و 75 مسارًا فريدًا فقط، بسبب إعادة استخدام أسماء صور تأكيد الشراء. أُصلحت تسمية الصور في الأداة؛ [الرابعة](../../mobile/evidence/store-ui-prior-adbdf39017934f3e.json) اجتازت 790 طلبًا قبل إصلاح AppGate، و[الخامسة](../../mobile/evidence/store-ui-prior-6b12d617db524d3b.json) اجتازت 805 طلبات قبل تغيير إعداد الرجوع. السادسة النهائية مستقلة وسجلت 802 طلبًا و 83 صورة فريدة؛ لا تُحمل إليها نجاحات المحاولات السابقة أو صورها.

[محاولة Android الثالثة](evidence/native-store-emulator-prior-edf763ff2f4a480a.json) أثبتت إلغاء منتقي النظام وبقاء المسودة مع `auth/session` عاد 200، ثم اختيار PNG وحفظ المنتج في MySQL وتعديله وإخفاءه وإظهاره. بقي overall failed عند التحقق التاسع أثناء ضغط إعدادات المتجر؛ نجاحات محدودة داخل محاولة فاشلة، ولا تُحمل إلى الدليل النهائي. [الأولى](evidence/native-store-emulator-prior-c85bd18716504a76.json) فشلت عند أداة إدخال المخزون، و[الثانية](evidence/native-store-emulator-prior-8c2cf962fdb44c70.json) كشفت خلل AppGate الفعلي الذي أُصلح.

[الرحلة الرابعة](evidence/native-store-emulator-prior-634d231ff2ef4ec4.json) بقيت overall failed بعد 18 تحققًا عند `hardwareBack` من شاشة المتجر دون Modal إلى Launcher، رغم نجاح رفض الطلب في SQL والشراء المفقود الرد ومزامنته. المحاكي Android15/API35؛ مصدر React Native0.86 يسجل callback الرجوع الجديد عند API36 و target36 أو أعلى. تعارض predictive back مع JS BackHandler على هذه البيئة سبب مرجح من المصدر؛ أُوقف `predictiveBackGestureEnabled`، وأثبتت الرحلة السادسة الرجوع الفعلي على APK الجديد. [الخامسة](evidence/native-store-emulator-prior-0109aef126d64e05.json) فشلت عند تنقل DevMenu خلال الاستعادة. النهائية تعاملت مع الواجهة فقط عبر نقطة الحساب خارج Tools، ولم تُسجّل أحداث إغلاق DevMenu أو onboarding في الرحلة النهائية؛ لا قراءة أو كتابة لملفات تفضيلات أو مفاتيح. لا دليل Android16/API36 أو جهاز فعلي من ذلك.

بناء [APK المتجر الجديد](../../mobile/artifacts/nukhab-native-store-debug-x86_64.apk) اجتاز و cleaned؛ [تقريره](../../mobile/artifacts/android-store-build-stage.json) وسجل [البناء](../../mobile/evidence/store-android-build.log) يثبتان Gradle في 4m26s ومطابقة 195 بصمة مصدر/stage/current مستقلة. مجلد stage `.nb/s4cd67a32` أُزيل؛ لا generated Android أو manual RN edits. حجم APK93,425,653 بايت، SHA-256=`C548BB4CA82C3CA829AD8F9A98BFB5F827FC0032FDD5F2F0F1CC10E0CBB515E6`؛ SHA تقرير البناء=`6386F76603A427D26F711AEBA8E6D524B922B19597E3DCD363DF1D80AC469FA9`.

الأمر المستخدم يمرر `-ArtifactName nukhab-native-store-debug-x86_64.apk -ReportName android-store-build-stage.json` إلى helper المحروس، الذي يطبق app.json داخل stage و prebuild جديد. فحص aapt أكد manifest الرجوع false و target>=36؛ runtime المحاكي API35. APK التاريخي ذو SHA=`90AB1946D3F1F35EDB237B24DA11D1237B8F7EB2A6118CAD2655EABCC92A4D3A` وتقرير SHA=`BE8AAF831C81D6FE7082A517ED0726A817CD796C05E122BF9E32B6422A571C94` محفوظان بلا overwrite. الجديد development client محلي مع Metro، وليس release أو iPhone؛ استُعمل في الرحلة السادسة النهائية.

## التشغيل وحدود الإغلاق

استعمل npm و lockfile لكل نطاق، والخادم المحلي و MySQL الاصطناعي فقط. السيناريوهات تستعمل loader العزل القائم وحاجز تهيئة WhatsApp، دون مزود خارجي. تقرير [MySQL الأحدث](../../outputs/native-conversion/native-store-mysql-runtime.json) أصبح stopped؛ لا تفترض أن 3310 يعمل. قبل إعادة التشغيل افحص PID/config/datadir والمنفذ، ولا تعِد تهيئة القواعد المحفوظة أو تمس MySQL3312. لا تقرأ `data1.yml` لعمل محلي. SHA تدقيق الأدوات=`EEF38272A5DC0A204F1E173051586B3C0EEA4241D429C62DC0F9408D1A4D2726`، وتدقيق القواعد=`00F956DCC073504742898CA5BE9C388F2FD5EF78D92B807C50E0AD283B78DFB6`، والملكية=`B1EDB2C308E8BD1FBC9822F860E6C29AA46787785FF97DDEAA475B90A6D52D04`.

المحاكي 5584 المملوك وحده مستهدف، ولم يُمس 5560 أو قاعدة تجربة W01. الرحلة النهائية استخدمت التخزين الأصلي والطابور واستعادته بعد إغلاق العملية؛ هذا لا يثبت قراءة ترويسة SQLCipher أو سيناريو فقد المفتاح، ولم تُقرأ أو تُكتب ملفات المفاتيح أو التفضيلات. لا تستبدل ذلك باختبارات Node أو Hermes أو ذاكرة المتصفح. لا دليل Android فعلي أو iPhone أو بناء iOS أصلي أو API36، ولا دخول بارد دون إنترنت أو إغلاق W10 أو W11 أو شرط W08-02. تنفيذ القرآن يظل عند المشرف كما هو.

لم يُنفذ SQL إنتاجي أو نشر أو commit أو push أو تعديل بيانات استضافة. مراجعة AGENTS: اجتازت ضمن الحدود الموثقة.

