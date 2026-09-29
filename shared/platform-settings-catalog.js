export const PLATFORM_POLICY_PREFIX = 'platformPolicy:';

export const PLATFORM_POLICY_VALUES = Object.freeze({
  enabled: 'enabled',
  disabled: 'disabled',
  tenant: 'tenant',
});

const number = (key, label, defaultValue, min = 0, max = undefined) => ({
  key, label, type: 'number', defaultValue, min, ...(max === undefined ? {} : { max }),
});
const text = (key, label, defaultValue = '', type = 'text') => ({ key, label, type, defaultValue });
const toggle = (key, label, defaultValue = false) => ({ key, label, type: 'boolean', defaultValue });
const select = (key, label, defaultValue, options) => ({ key, label, type: 'select', defaultValue, options });

export const platformSettingsGroups = [
  {
    key: 'plans', label: 'الخطط والقرآن', settings: [
      text('quranPlanStartDate', 'البداية', '', 'date'),
      text('quranPlanEndDate', 'النهاية', '', 'date'),
      { key: 'weeklyHolidayDays', label: 'أيام الإجازة', type: 'weekDays', defaultValue: [5, 6] },
      { key: 'holidayTaskTypes', label: 'مهام الإجازة', type: 'taskTypes', defaultValue: [] },
      { key: 'recitationSessionDays', label: 'أيام التسميع', type: 'weekDays', defaultValue: [0, 1, 2, 3, 4] },
      select('recitationAttendanceSource', 'مصدر حضور التسميع', 'supervisor', [
        { value: 'supervisor', label: 'المشرف' }, { value: 'teacher', label: 'المعلم' },
      ]),
      select('quranReferenceMode', 'عرض مرجع القرآن', 'ayah', [
        { value: 'ayah', label: 'السورة والآية' }, { value: 'page', label: 'رقم الصفحة' },
      ]),
      toggle('hideStudentAmounts', 'إخفاء المقدار عن الطلاب', false),
      toggle('hideStudentMemorizationAmount', 'إخفاء الحفظ والإتقان', true),
      toggle('hideStudentReviewAmount', 'إخفاء المراجعة', true),
      toggle('hideStudentLinkAmount', 'إخفاء الربط', true),
      toggle('studentReviewAmountEditable', 'تعديل الطالب لمقدار المراجعة', true),
      toggle('studentTaskAmountEditable', 'السماح للطالب بتقليل مقدار حفظ اليوم', true),
      toggle('allowQuranCompensation', 'السماح بإكمال الحفظ المتأخر (التعويض)', true),
      toggle('allowQuranExtra', 'السماح بتجاوز مقدار اليوم والتقدم في الخطة', false),
      number('memorizationRepeatCount', 'عدد تكرارات الحفظ', 1, 1),
      number('masteryRepeatCount', 'عدد تكرارات الإتقان', 1, 1),
      number('memorizationListeningCount', 'عدد مرات سماع الحفظ', 3, 1),
      number('masteryListeningCount', 'عدد مرات سماع الإتقان', 3, 1),
    ],
  },
  {
    key: 'attendance', label: 'الحضور والغياب', settings: [
      toggle('attendanceManualEnabled', 'الحضور اليدوي', true),
      toggle('attendanceAccountEnabled', 'حضور الطالب من حسابه'),
      { key: 'attendanceDays', label: 'أيام الحضور', type: 'weekDays', defaultValue: [0, 3] },
      toggle('allowEarlyAttendance', 'السماح بالحضور المبكر', true),
      text('attendanceStartTime', 'وقت بداية الحضور', '16:00', 'time'),
      text('attendanceAbsentTemplate', 'قالب رسالة الغياب', 'السلام عليكم، تم تسجيل غياب الطالب {name} بتاريخ {date}.', 'textarea'),
      toggle('automaticAbsenceMessageEnabled', 'رسالة الغياب التلقائية'),
    ],
  },
  {
    key: 'points', label: 'النقاط والمتجر والترتيب', settings: [
      toggle('studentRankingsVisible', 'إظهار ترتيب الطلاب', true),
      toggle('familyRankingsVisible', 'إظهار ترتيب الحلقات', true),
      toggle('rankingPointsVisible', 'عرض نقاط الترتيب', true),
      toggle('storeEnabled', 'المتجر'),
      toggle('storePurchaseDeductsRanking', 'خصم شراء المتجر من الترتيب'),
      toggle('teacherManualPointsEnabled', 'السماح للمعلم بالإضافة والخصم'),
      number('teacherManualPointsTermLimit', 'حد المعلم في الفصل', 100),
      { key: 'teacherPointTypes', label: 'أنواع إضافة وخصم المعلم', type: 'teacherPointTypes', defaultValue: [] },
      number('maxSupervisorStudentPoints', 'حد نقاط المشرف للطالب', 10),
      number('maxSupervisorFamilyItemsPoints', 'حد نقاط المشرف للحلقة', 100),
      number('maxSupervisorDeductionPoints', 'حد خصم المشرف', 10),
      toggle('familyPointsAddToStudents', 'إضافة نقاط الحلقة للطلاب', true),
      toggle('familyPointsAddToAbsentStudents', 'إضافة نقاط الحلقة للغائبين', true),
      toggle('studentPointsAddToFamily', 'إضافة نقاط الطالب للحلقة', true),
      select('familyEvaluationScope', 'نطاق تقييم الحلقة', 'program_supervisor', [
        { value: 'program_supervisor', label: 'مشرف البرنامج' },
        { value: 'all_supervisors', label: 'جميع المشرفين' },
      ]),
    ],
  },
  {
    key: 'registration', label: 'التسجيل والرسائل', settings: [
      toggle('registrationEnabled', 'فتح التسجيل'),
      text('registrationPreAcceptTemplate', 'قالب القبول المبدئي', '', 'textarea'),
      text('registrationAcceptTemplate', 'قالب القبول النهائي', '', 'textarea'),
      text('registrationRejectTemplate', 'قالب رفض التسجيل', '', 'textarea'),
      text('narrationStartTemplate', 'قالب بداية يوم السرد', '', 'textarea'),
      text('narrationEndTemplate', 'قالب نهاية يوم السرد', '', 'textarea'),
      text('narrationResultTemplate', 'قالب نتيجة يوم السرد', '', 'textarea'),
    ],
  },
  {
    key: 'narration', label: 'يوم السرد', settings: [
      number('narrationMaxScore', 'السرد — أصل الدرجة', 100, 1),
      number('narrationWarningDeduction', 'السرد — خصم التنبيه', 1),
      number('narrationMistakeDeduction', 'السرد — خصم الخطأ', 5),
    ],
  },
  {
    key: 'access', label: 'صفحات النظام', settings: [
      toggle('studentsSectionEnabled', 'الطلاب', true),
      toggle('studentPlansSectionEnabled', 'خطط الطلاب', true),
      toggle('committeesSectionEnabled', 'الحلقات', true),
      toggle('usersRolesSectionEnabled', 'المستخدمون والصلاحيات', true),
      toggle('registrationRequestsSectionEnabled', 'طلبات التسجيل', true),
      toggle('narrationSectionEnabled', 'يوم السرد', true),
      toggle('reportsSectionEnabled', 'التقارير والتصدير', true),
      toggle('callsSectionEnabled', 'المكالمات', true),
      toggle('rankingsSectionEnabled', 'الترتيب والمكافآت', true),
      toggle('storeSectionEnabled', 'المتجر والمنتجات', true),
      toggle('brandingSectionEnabled', 'الهوية والشعار', true),
      toggle('supportSectionEnabled', 'الدعم والتواصل', true),
      toggle('legalSectionEnabled', 'الصفحات القانونية', true),
      toggle('securitySectionEnabled', 'الدخول والأمان', true),
      toggle('deletionRequestsSectionEnabled', 'طلبات حذف الحساب', true),
      toggle('termClosureSectionEnabled', 'إنهاء الفترة', true),
    ],
  },
];

export const platformSettingsCatalog = platformSettingsGroups.flatMap((group) => group.settings);
export const platformSettingsByKey = new Map(platformSettingsCatalog.map((setting) => [setting.key, setting]));

export const platformFeatureSettingKeys = platformSettingsGroups
  .find((group) => group.key === 'access').settings.map((setting) => setting.key);
