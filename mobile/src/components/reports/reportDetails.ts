import type { ReportDetailRow, ReportValue } from '../../domain/reportManagement';
import { formatReportFaces, formatReportNumber } from '../../domain/reportManagement';

const labels: Record<string, string> = { attendance: 'الحضور', memorization: 'الحفظ', mastery: 'الإتقان', review: 'المراجعة', link: 'الربط', reading: 'القراءة', repeat: 'التكرار',
  done: 'المنجز', total: 'المطلوب', expected: 'المطلوب', expectedFaces: 'الأوجه المطلوبة', actualFaces: 'الأوجه المنجزة', grade: 'الدرجة', max: 'الدرجة القصوى', percentage: 'النسبة',
  completed: 'المكتمل', required: 'المطلوب', executed: 'المنفذ', present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب', totalDays: 'الأيام', recorded: 'المرصود',
  notMemorized: 'لم يحفظ', compensation: 'التعويض', compensated: 'المعوض', extra: 'التجاوز', points: 'النقاط', startDate: 'البداية', endDate: 'النهاية', date: 'التاريخ',
  taskDate: 'تاريخ المقدار', sessionDate: 'تاريخ الجلسة', gradeDate: 'تاريخ الدرجة', weekStart: 'بداية الأسبوع', displayRange: 'المقدار', range: 'النطاق',
  saved: 'المحفوظ', memorizationFaces: 'أوجه الحفظ', masteryFaces: 'أوجه الإتقان', reviewFaces: 'أوجه المراجعة', linkFaces: 'أوجه الربط', readingFaces: 'أوجه القراءة',
  overallPercentage: 'الأداء الإجمالي', tasks: 'المهام', dailyDetails: 'تفاصيل الأيام', executionTotals: 'مجاميع التنفيذ', planProgress: 'تقدم الخطة',
  status: 'الحالة', teacherName: 'المشرف', warnings: 'التنبيهات', hesitations: 'الترددات', mistakes: 'الأخطاء', requiredFaces: 'الأوجه المطلوبة',
  fromSurahName: 'سورة البداية', toSurahName: 'سورة النهاية', startSurahName: 'سورة البداية', endSurahName: 'سورة النهاية', fromAyah: 'آية البداية', toAyah: 'آية النهاية',
  startAyah: 'آية البداية', endAyah: 'آية النهاية', fromPage: 'صفحة البداية', toPage: 'صفحة النهاية', startPage: 'صفحة البداية', endPage: 'صفحة النهاية',
  faceCount: 'عدد الأوجه', faces: 'الأوجه', actualRepeatCount: 'التكرار المنفذ', requiredRepeatCount: 'التكرار المطلوب', actualListeningCount: 'التسميع المنفذ',
  expectedListeningCount: 'التسميع المطلوب', accepted: 'معتمد', passed: 'مجتاز', completedOn: 'تاريخ الاكتمال', planEndDate: 'نهاية الخطة',
  targetEndDate: 'النهاية المطلوبة', actualStartDate: 'البداية الفعلية', scheduledEndDate: 'النهاية المتوقعة', current: 'الحالي', remaining: 'المتبقي',
  evaluationScore: 'درجة التسميع', evaluationMaxScore: 'الدرجة القصوى للتسميع', attemptNumber: 'رقم المحاولة', attemptCount: 'عدد المحاولات',
  evaluatedAt: 'وقت التقييم', warningCount: 'عدد التنبيهات', hesitationCount: 'عدد الترددات', mistakeCount: 'عدد الأخطاء', teacherCompleted: 'اكتمال التسميع',
  taskType: 'نوع المقدار', trackLabel: 'المسار', compensationDays: 'أيام التعويض', targetPages: 'الأوجه المطلوبة',
  actualToPage: 'صفحة النهاية الفعلية', actualToSurahName: 'سورة النهاية الفعلية', actualToAyah: 'آية النهاية الفعلية',
  expectedPreview: 'المقدار المطلوب', actualPreview: 'المقدار الفعلي', studentStatus: 'حالة الطالب', totalFaces: 'إجمالي الأوجه',
  memorizationRange: 'نطاق الحفظ', pageRange: 'نطاق الصفحات', surahRange: 'نطاق الآيات', ranges: 'النطاقات', pagesCount: 'عدد الصفحات',
  checkInTime: 'وقت التحضير', recordDate: 'تاريخ التحضير', checkInMethod: 'طريقة التحضير', distance: 'المسافة بالمتر', jobTitle: 'المسمى الوظيفي', role: 'نوع الحساب',
  attended: 'عدد الحضور', notRecorded: 'غير مرصود', recordedWeeks: 'الأسابيع المرصودة', segments: 'المقاطع', tested: 'المختبرة',
  details: 'تفاصيل المقادير', items: 'المقادير', amount: 'المقدار', attendanceStatus: 'حالة الحضور', memorizationStatus: 'حالة الحفظ', masteryStatus: 'حالة الإتقان',
  memorizationItems: 'مقادير الحفظ', masteryItems: 'مقادير الإتقان', reviewItems: 'مقادير المراجعة', linkItems: 'مقادير الربط', listening: 'التسميع', evaluation: 'التقييم',
  amountFaces: 'الأوجه', normal: 'الإنجاز الاعتيادي', actualStart: 'البداية الفعلية', normalEnd: 'النهاية الاعتيادية', scheduledEnd: 'النهاية المطلوبة',
  page: 'الصفحة', surah: 'السورة', ayah: 'الآية', shortageFaces: 'الأوجه المتأخرة', isAhead: 'متقدم على الخطة',
  currentPoints: 'الرصيد الحالي', attendanceExpected: 'الحضور المطلوب', attendanceCount: 'عدد الحضور', activeDays: 'الأيام النشطة' };
const statuses: Record<string, string> = { present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب', completed: 'مكتمل', pending: 'منتظر',
  memorization: 'حفظ', mastery: 'إتقان', review: 'مراجعة', link: 'ربط', reading: 'قراءة', repeat: 'تكرار', active: 'نشطة', closed: 'مغلقة', paused: 'موقوفة',
  supervisor: 'مشرف', admin: 'إداري', manager: 'مدير', student: 'طالب', manual: 'يدوي', location: 'الموقع', teacher: 'الحساب', not_memorized: 'لم يحفظ',
  not_recorded: 'غير مرصود', unrecorded: 'غير مرصود', no_session: 'لا توجد جلسة في هذا اليوم', self: 'الحساب', executed: 'منفذ', not_executed: 'غير منفذ' };

Object.assign(labels, { executionBreakdown: 'تفاصيل التنفيذ', executionState: 'نوع التنفيذ', teacherRatingLabel: 'تقدير التسميع', preview: 'المقدار', ayahPreview: 'مقدار الآيات', pagePreview: 'مقدار الصفحات', ayahMarks: 'أخطاء الآيات', wordMarks: 'أخطاء الكلمات', selectedText: 'النص المحدد', notes: 'الملاحظات', textUthmani: 'نص الآية', surahName: 'السورة', markType: 'نوع العلامة', occurrenceCount: 'عدد المواضع', startSurah: 'سورة البداية', endSurah: 'سورة النهاية', startWordPosition: 'موضع البداية', endWordPosition: 'موضع النهاية', startLocation: 'بداية التحديد', endLocation: 'نهاية التحديد', expectedWeeks: 'الأسابيع المطلوبة', scope: 'نطاق التعويض', actorName: 'من سجل التعويض', recordedAt: 'وقت تسجيل التعويض', components: 'عناصر التعويض', cancelledAt: 'حالة إلغاء التعويض', cancelledByName: 'من ألغى التعويض', cancellationReason: 'سبب الإلغاء' });
Object.assign(statuses, { mistake: 'خطأ', lahn: 'لحن', warning: 'تنبيه', hesitation: 'تردد', normal: 'اعتيادي', compensation: 'تعويض', extra: 'تجاوز', program: 'البرنامج', track: 'جلسة المسار' });
const enumFields=new Set(['status','role','taskType','markType','executionState','checkInMethod','studentStatus','attendanceStatus','memorizationStatus','masteryStatus','scope']);
export interface ReportFieldSection { label: string; value?: string; children?: ReportFieldSection[] }
export function reportValueSection(value: ReportValue | undefined, label: string, depth=0, field=''): ReportFieldSection | null {
  if(value===undefined||depth>10)return null;
  if(value===null)return {label,value:field==='cancelledAt'?'لم يُلغَ':'غير متاح'};
  if(typeof value!=='object'){
    let display=typeof value==='boolean'?(value?'نعم':'لا'):typeof value==='number'?formatReportFaces(value):enumFields.has(field)&&Object.hasOwn(statuses,value)?statuses[value]:value;
    if(typeof value==='string'&&['startLocation','endLocation'].includes(field)&&/^\d+:\d+:\d+$/.test(value)){ const [surah,ayah,position]=value.split(':'); display='سورة '+surah+'، آية '+ayah+'، موضع '+position; }
    return {label,value:display};
  }
  const children=(Array.isArray(value)?value.map((item,index)=>reportValueSection(item,label+' '+formatReportNumber(index+1),depth+1,field))
    :Object.entries(value).filter(([key])=>Object.hasOwn(labels,key)).map(([key,item])=>reportValueSection(item,labels[key]!,depth+1,key))).filter((item):item is ReportFieldSection=>item!==null);
  return children.length?{label,children}:null;
}
export function reportRowSections(row: ReportDetailRow): ReportFieldSection[] {
  return Object.entries(row).filter(([key])=>Object.hasOwn(labels,key)).map(([key,value])=>reportValueSection(value,labels[key]!,0,key)).filter((item):item is ReportFieldSection=>item!==null);
}
