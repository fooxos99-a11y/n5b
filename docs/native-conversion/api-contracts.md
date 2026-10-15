# عقود نخب المحلية وبيانات اختبار التحويل

أُجري تحقق HTTP فعلي في 2026-10-14 من مسارات الخادم الحالي داخل قاعدة MySQL جديدة ومعزولة باسم `nukhab_native_contract_db5cd35fe3a147ca`. نجحت **71 حالة**. هذا مرجع للخطوتين W00-05 وW00-07؛ لا يثبت تنفيذ التطبيق النيتف أو صحة مزامنة تسميع كامل على الهاتف.

## تشغيل التحقق وإعادة إنتاجه

```powershell
node --loader ./tests/fixtures/isolated-server-loader.mjs tests/nativeConversionContracts.mysql.mjs
```

[الاختبار](../../tests/nativeConversionContracts.mysql.mjs) يتحقق من اتصال MySQL محلي قبل استيراد التشغيل. يختار قاعدة جديدة باسم مقيد، ويشغّل التطبيق عبر [المحمّل المعزول](../../tests/fixtures/isolated-server-loader.mjs) الذي يعطل الاستماع التلقائي والمهام الخلفية والتكاملات الخارجية. خادم الاختبار يستمع إلى منفذ عشوائي على 127.0.0.1 وينتهي مع الاختبار. لا تُغيّر قاعدة التشغيل الحالية أو ملفات البيئة، ولا تُحذف قاعدة الاختبار تلقائيًا.

البيانات اصطناعية فقط: مجمعان وحلقتان، مدير ومشرف وإداري مخوّل وإداري بلا منح وموظف معطل ودور مقرئ مرفوض، وطلاب داخل نطاق المشرف وخارجه ومتقدم للتسجيل. تُنشأ كلمات مرور الاختبار في الذاكرة، وتُحفظ تجزئاتها في قاعدة الاختبار، ولا تُصدّر كلمة مرور أو رمز جلسة في تقرير الأدلة. يستطيع تشغيل الاختبار مجددًا إنشاء مجموعة حالات مستقلة.

المرجع القابل للمعالجة آليًا هو [api-contracts.json](evidence/api-contracts.json). يحفظ حالة HTTP وأسماء حقول الاستجابة فقط، دون محتوى بيانات الحساب أو رموز الجلسات.

## العقود التي يجب أن يحافظ عليها عميل الجوال

- الدخول يرسل رقم الدخول وكلمة المرور. الطلب النيتف يحمل `X-Nukhab-Native: 1`؛ الاستجابة الناجحة تحتوي الدور والمعرف والاسم ورمز الجلسة وسياق الجهة ووجهة API المحسوبة. الدخول من الويب يستخدم ملف ارتباط HttpOnly دون إظهار الرمز في JSON.
- الطلب المحمي من الجوال يستخدم `Authorization: Bearer` مع سياق الجهة الموثوق. الخروج يبطل الجلسة على الخادم، وأي طلب لاحق بها يُرفض.
- استعادة الجلسة تستخدم `GET /auth/session` بالرمز المحفوظ أو ملف ارتباط الويب. تعيد هوية حديثة وسياق الجهة ومنح الأقسام من الخادم، ولا تعيد إصدار رمز الدخول في JSON. سحب المنحة ينعكس على الاستعادة، والحساب المعطل أو الدور المتغير أو الجلسة الملغاة يرفض الاستعادة بـ401.
- المدير يصل إلى وظائف الإدارة؛ الإداري يعتمد على منح الأقسام داخل الجهة. تعديل منح الإداري يتم عبر عقد `/administrators/:id`، أما `/dashboard-permissions/:supervisorId` فيخص المشرف.
- الطالب يقرأ بياناته فقط. المشرف يستخدم عقد التسميع الخاص به وحدود حلقاته؛ اختبار مرجع الخطة لا يوسّع API الطالب إلى المشرف افتراضًا.
- التسجيل العام يعيد خيارات المجمع والحلقة عند السماح به. الإغلاق يرفض الإرسال، وتعارض المجمع والحلقة يرفض الطلب، والطلب المكرر يعيد 409. القبول النهائي ينشئ حساب الطالب مرة واحدة.
- منحة الأسبوعي تتيح قراءة سياستها، ولا تعطي تغيير إعدادات السياسات. payload جلسة غير صالح يعيد 422. نجاح حفظ جلسة كاملة وتقييمها يثبت لاحقًا ضمن W06 وW08.
- تجهيز العمل المحلي للطالب خاص بدوره. تجهيز التسميع وحالة المزامنة والدفعات للمشرف لهما عقود منفصلة؛ اختبار الدفعة الفارغة يثبت شكل المسار فقط. قبول جلسة كاملة وإعادتها دون تكرار يثبت ضمن W01 وW10.
- دليل المكالمات له عقد قابل للقراءة، وإنشاء غرفة يتطلب الدور المسموح وخدمة مهيأة. غياب التهيئة يعيد 503؛ لا يُستخدم هذا التحقق بديلًا عن مكالمة فعلية.
- حالة جاهزية دفع الإشعارات تُقرأ من الخادم؛ استلام إشعار على جهاز وفتحه ضمن صلاحيات الحساب يثبت في W11.

## نتائج HTTP الفعلية

| الحالة | الطريقة | المسار | HTTP المتوقع والفعلي |
|---|---|---|---|
| Unauthenticated settings denied | GET | `/settings` | 401 |
| Session restoration requires authentication | GET | `/auth/session` | 401 |
| Empty login rejected | POST | `/auth/login` | 422 |
| Wrong password rejected | POST | `/auth/login` | 401 |
| Unknown login rejected | POST | `/auth/login` | 404 |
| Unknown numeric login attempt 1 | POST | `/auth/login` | 404 |
| Unknown numeric login attempt 2 | POST | `/auth/login` | 404 |
| Unknown numeric login attempt 3 | POST | `/auth/login` | 404 |
| Unknown numeric login attempt 4 | POST | `/auth/login` | 404 |
| Unknown numeric login attempt 5 | POST | `/auth/login` | 404 |
| Server blocks the sixth failed login attempt | POST | `/auth/login` | 429 |
| Native manager login | POST | `/auth/login` | 200 |
| Web login keeps token out of JSON | POST | `/auth/login` | 200 |
| Create synthetic student | POST | `/students` | 201 |
| Create synthetic student | POST | `/students` | 201 |
| Native student login | POST | `/auth/login` | 200 |
| Native supervisor login | POST | `/auth/login` | 200 |
| Native administrator login | POST | `/auth/login` | 200 |
| Administrator without grants signs in | POST | `/auth/login` | 200 |
| Restore manager identity | GET | `/auth/session` | 200 |
| Restore student identity | GET | `/auth/session` | 200 |
| Restore supervisor identity | GET | `/auth/session` | 200 |
| Restore admin identity | GET | `/auth/session` | 200 |
| Restore admin identity | GET | `/auth/session` | 200 |
| Cookie restores web identity without exposing token | GET | `/auth/session` | 200 |
| Administrator without grants cannot list students | GET | `/students` | 403 |
| Inactive staff cannot sign in | POST | `/auth/login` | 404 |
| Removed reciter cannot sign in | POST | `/auth/login` | 404 |
| Manager reads settings | GET | `/settings` | 200 |
| Student cannot list students | GET | `/students` | 403 |
| Administrator granted students | GET | `/students` | 200 |
| Administrator denied settings | GET | `/settings` | 403 |
| Student own amount allowed | GET | `/students/1/quran-today` | 200 |
| Student other account denied | GET | `/students/2/quran-today` | 403 |
| Supervisor uses own teacher evaluation endpoint | GET | `/supervisors/2/quran-evaluation` | 200 |
| Supervisor cannot read another teacher evaluation | GET | `/supervisors/1/quran-evaluation` | 403 |
| Supervisor other circle denied | GET | `/students/2/quran-today` | 403 |
| Weekly grant can read policy | GET | `/grading/policy` | 200 |
| Weekly grant cannot change policy | PUT | `/grading/policy` | 403 |
| Manager weekly grading response | GET | `/grading/week?component=weekly` | 200 |
| Student cannot read grading management week | GET | `/grading/week?component=weekly` | 403 |
| Invalid grading payload rejected | PUT | `/grading/weekly-component` | 422 |
| Closed registration rejects submission | POST | `/registration/public` | 403 |
| Manager opens registration | PUT | `/registration-requests/config` | 200 |
| Public registration options | GET | `/registration/public` | 200 |
| Mismatching registration placement rejected | POST | `/registration/public` | 422 |
| Public registration accepted as request | POST | `/registration/public` | 201 |
| Duplicate application rejected | POST | `/registration/public` | 409 |
| Student cannot approve registration | POST | `/registration-requests/1/accept` | 403 |
| Granted administrator creates student on final acceptance | POST | `/registration-requests/1/accept` | 201 |
| Accepted student can sign in | POST | `/auth/login` | 200 |
| Repeated final acceptance cannot create another student | POST | `/registration-requests/1/accept` | 404 |
| Student offline bootstrap | POST | `/offline-student/bootstrap` | 200 |
| Supervisor cannot use student workspace | POST | `/offline-student/bootstrap` | 403 |
| Student cannot bootstrap teacher recitation | POST | `/offline-recitation/bootstrap` | 403 |
| Supervisor offline workspace bootstrap | POST | `/offline-recitation/bootstrap` | 200 |
| Supervisor synchronization status contract | POST | `/offline-recitation/status` | 200 |
| Supervisor empty synchronization batch | POST | `/offline-recitation/batch` | 200 |
| Student synchronization batch denied | POST | `/offline-recitation/batch` | 403 |
| Manager call directory contract | GET | `/calls` | 200 |
| Unconfigured calls return unavailable | POST | `/calls` | 503 |
| Student cannot create a call room | POST | `/calls` | 403 |
| Native push readiness contract | GET | `/notifications/push-status` | 200 |
| Manager revokes an existing administrator grant | PUT | `/administrators/3` | 200 |
| Revoked grant is rejected with the existing session | GET | `/students` | 403 |
| Restoration refreshes revoked grants | GET | `/auth/session` | 200 |
| Disabled staff cannot restore an existing session | GET | `/auth/session` | 401 |
| Changed staff role cannot reuse former session identity | GET | `/auth/session` | 401 |
| Native logout | POST | `/auth/logout` | 200 |
| Logged-out session cannot restore | GET | `/auth/session` | 401 |
| Revoked bearer session denied | GET | `/settings` | 401 |

الحالات الناجحة والرفض متحققان بحسب مصدر الخادم الحالي، ولا تعني هذه النتائج أن كل endpoint في المشروع غُطي باختبار رحلة كاملة. حالات الجهاز والترحيل والأداء تبقى مرتبطة بخطواتها في ملف المتابعة.

مراجعة AGENTS: اجتازت.
