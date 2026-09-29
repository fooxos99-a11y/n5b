import useQueuedAutosave from '@/hooks/useQueuedAutosave';
import StaffAttendanceSettings from './StaffAttendanceSettings';
import EndTermDialog from './EndTermDialog';
import SettingsGroup from './SettingsGroup';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import AccountDeletionRequestsDialog from '@/components/dashboard/AccountDeletionRequestsDialog';
import AccountPolicyLinks from '@/components/dashboard/AccountPolicyLinks';
import SettingsCategoryPanel from '@/components/dashboard/SettingsCategoryPanel';
import NotificationSettings from '@/components/dashboard/NotificationSettings';
import { studentsApi } from '@/services/studentsApi';
import SettingToggle from '@/components/ui/setting-toggle';
import InlineToggleNumberSetting from '@/components/ui/inline-toggle-number-setting';
import TeacherPointTypesSetting from '@/components/dashboard/TeacherPointTypesSetting';
import ResetPointsDialog from '@/components/dashboard/ResetPointsDialog';
import { enforcePointsFeatureDependencies } from '../../../shared/points-feature-settings.js';
import { writePublicSettingsCache } from '@/services/publicSettingsCache';
import GradingSettingsPanel from '@/components/dashboard/GradingSettingsPanel';

const defaultSettings = {
  attendanceManualEnabled: true,
  weeklyHolidayDays: [5, 6],
  holidayTaskTypes: [],
  recitationSessionDays: [0, 1, 2, 3, 4],
  quranTaskExecutionSource: 'student',
  memorizationExecutionSource: 'teacher',
  reviewExecutionSource: 'both',
  linkExecutionSource: 'both',
  recitationAmountDay: 'previous_day',
  hideStudentAmounts: false,
  hideStudentMemorizationAmount: true,
  hideStudentReviewAmount: true,
  hideStudentLinkAmount: true,

  studentTaskAmountEditable: true,
  studentReviewAmountEditable: true,
  studentLinkAmountEditable: false,
  allowQuranCompensation: true,
  allowQuranExtra: false,
  recitationAttendanceSource: 'supervisor',
  staffAttendanceSource: 'supervisor',
  staffAttendanceLocationUrl: '',
  staffAttendanceLateAfterAsrMinutes: 50,
  automaticAbsenceMessageEnabled: false,
  automaticExecutionMessageEnabled: false,
  executionReminderExcludedStudentIds: [],
  attendanceAbsentTemplate: 'السلام عليكم، تم تسجيل غياب الطالب {name} بتاريخ {date}.',
  quranReferenceMode: 'ayah',
  teacherManualPointsEnabled: false,
  teacherManualPointsTermLimit: 100,
  teacherPointTypes: [],
  studentRankingsVisible: true,
  familyRankingsVisible: true,
  familyRankingMode: 'total',
  rankingPointsVisible: true,
  storeEnabled: false,
  storePurchaseDeductsRanking: false,
  registrationEnabled: false,
  registrationPreAcceptTemplate: 'السلام عليكم، تم قبول طلب تسجيل الطالب {name} مبدئياً، وسيتم التواصل معكم لإكمال الإجراء.',
  registrationAcceptTemplate: 'السلام عليكم، تم قبول الطالب {name} في حلقة {committee}. رقم الدخول: {login}.',
  registrationRejectTemplate: 'السلام عليكم، نعتذر عن قبول طلب تسجيل الطالب {name} حالياً.',
  executionReminderTemplate: 'السلام عليكم، لم يتم تنفيذ خطة الطالب {name} بتاريخ {date}.',
  narrationMaxScore: 100,
  narrationWarningDeduction: 1,
  narrationMistakeDeduction: 5,
  narrationStartTemplate: 'السلام عليكم، بدأ {eventName} من {fromDate} إلى {toDate}.',
  narrationEndTemplate: 'السلام عليكم، انتهى {eventName}.',
  narrationResultTemplate: 'نتيجة {name} في {eventName}: {score} من 100، التقدير {rating}.',
  memorizationRepeatCount: 1,
  masteryRepeatCount: 1,
  memorizationListeningCount: 3,
  masteryListeningCount: 3,
  allowRepeatCountEditing: false,
  allowListeningCountEditing: false,
};


const mergeStudentTaskEditingControls = (value) => {
  return {
    ...value,
    attendanceManualEnabled: value.recitationAttendanceSource !== 'teacher',
    memorizationExecutionSource: value.memorizationExecutionSource || 'teacher',
  };
};

const SettingsSection = ({
  activeCategory = 'settingsGrading',
  onSettingsChange,
  canManageDeletionRequests = false,
  canResetPoints = false,
}) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [endTermOpen, setEndTermOpen] = useState(false);
  const [endTermConfirmText, setEndTermConfirmText] = useState('');
  const [isEndingTerm, setIsEndingTerm] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [policyStatus, setPolicyStatus] = useState('saved');
  const didLoadRef = useRef(false);
  const lastSavedRef = useRef('');
  const latestSettingsRef = useRef(defaultSettings);

  useEffect(() => {
    let mounted = true;
    studentsApi.getSettings().then((data) => {
      if (!mounted) return;
      const next = mergeStudentTaskEditingControls(
        enforcePointsFeatureDependencies({ ...defaultSettings, ...data }),
      );
      lastSavedRef.current = JSON.stringify(next);
      didLoadRef.current = true;
      setSettings(next);
      onSettingsChange?.(next);
    }).catch((error) => {
      if (!mounted) return;
      toast({ title: 'تعذر تحميل الإعدادات', description: error.message, variant: 'destructive' });
    }).finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [onSettingsChange, toast]);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useQueuedAutosave({
    channel: 'platform-settings', value: settings,
    enabled: didLoadRef.current && JSON.stringify(settings) !== lastSavedRef.current,
    save: async (value) => {
      const saved = mergeStudentTaskEditingControls(
        enforcePointsFeatureDependencies({ ...defaultSettings, ...(await studentsApi.updateSettings(value)) }),
      );
      writePublicSettingsCache(saved);
      window.dispatchEvent(new CustomEvent('nukhab-settings-updated', { detail: saved }));
      if (JSON.stringify(latestSettingsRef.current) !== JSON.stringify(value)) return;
      latestSettingsRef.current = saved;
      lastSavedRef.current = JSON.stringify(saved);
      setSettings(saved);
      onSettingsChange?.(saved);
    },
    onStatus: status => { setIsSaving(status === 'saving'); setSaveStatus(status); },
    onError: error => toast({ title: 'تعذر الحفظ التلقائي', description: error.message, variant: 'destructive' }),
  });

  const endTerm = async () => {
    setIsEndingTerm(true);
    try {
      const result = await studentsApi.endTerm(endTermConfirmText);
      toast({
        title: 'تم إنهاء الفصل',
        description: `تم إنشاء ${result.archive?.title || 'أرشيف جديد'}، ويبدأ الفصل الجديد بتاريخ ${result.archive?.nextTermStartDate || 'اليوم التالي'}.`,
      });
      setEndTermOpen(false);
      setEndTermConfirmText('');
    } catch (error) {
      toast({ title: 'تعذر إنهاء الفصل', description: error.message, variant: 'destructive' });
    } finally {
      setIsEndingTerm(false);
    }
  };

  if (isLoading) {
    return <DashboardLoader className="min-h-[420px]" />;
  }

  const termClosureSummary = 'ينشئ أرشيفًا للتقارير، ويحوّل الحفظ المعتمد إلى محفوظ سابق، ويوقف الخطط الحالية، ويصفّر النقاط وأرصدة المتجر. يبدأ الفصل الجديد في اليوم التالي، ولا تُحذف الحسابات أو المحفوظ.';

  const programPage = (
    <GradingSettingsPanel
      section="program"
      onStatusChange={setPolicyStatus}
      extraCards={[
        {
          title: 'التحضير',
          content: (
            <StaffAttendanceSettings settings={settings} setSettings={setSettings}>
                      <div className="space-y-2">
                        <Label>مسؤول تحضير الطلاب</Label>
                        <Select
                          value={settings.recitationAttendanceSource || 'supervisor'}
                          onValueChange={(value) => setSettings({
                            ...settings,
                            recitationAttendanceSource: value,
                            attendanceManualEnabled: value !== 'teacher',
                            automaticExecutionMessageEnabled: value === 'teacher'
                              ? false
                              : settings.automaticExecutionMessageEnabled,
                          })}
                        >
                          <SelectTrigger aria-label="مسؤول تحضير الطلاب" className="h-11 border-primary/30 bg-card"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="supervisor">المشرف</SelectItem>
                            <SelectItem value="teacher">المعلم</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </StaffAttendanceSettings>
          ),
        },
        {
          title: 'التعويض والتجاوز',
          content: (
            <SettingsGroup>
              <SettingToggle
                        label="تعويض الحفظ المتأخر"
                        checked={Boolean(settings.allowQuranCompensation)}
                        onCheckedChange={(checked) => setSettings({ ...settings, allowQuranCompensation: checked })}
                      />
                      <SettingToggle
                        label="تجاوز مقدار اليوم والتقدم في الخطة"
                        checked={Boolean(settings.allowQuranExtra)}
                        onCheckedChange={(checked) => setSettings({ ...settings, allowQuranExtra: checked })}
                      />
            </SettingsGroup>
          ),
        },
      ]}
    />
  );
  const showSaving = isSaving || policyStatus === 'saving';
  const showError = saveStatus === 'error' || policyStatus === 'error';
  const _resolveSettingsSection = () => {
    if (showError) {
      return 'تعذر الحفظ التلقائي';
    }
    if (showSaving) {
      return 'جاري الحفظ...';
    }
    return 'محفوظ تلقائياً';
  };
  return (
    <div className="space-y-7">
      {activeCategory === 'settingsGrading' && <div className="mx-auto w-full max-w-5xl">{programPage}</div>}
      {activeCategory !== 'settingsGrading' && <Card className="mx-auto w-full max-w-5xl overflow-visible rounded-2xl border-border bg-card shadow-[var(--app-shadow)]">
        <CardContent className="p-0 sm:p-0 lg:p-0">
          <SettingsCategoryPanel category="settingsNotifications" activeCategory={activeCategory} title="إعدادات الإشعارات">
            <NotificationSettings settings={settings} setSettings={setSettings} />
          </SettingsCategoryPanel>
          <SettingsCategoryPanel category="settingsNarration" activeCategory={activeCategory} title="يوم السرد">
          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">إعدادات يوم السرد</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="narration-max-score">أصل الدرجة</Label>
                <Input id="narration-max-score" type="number" min="1" value={settings.narrationMaxScore} onChange={(event) => setSettings({ ...settings, narrationMaxScore: event.target.value === '' ? '' : Number(event.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="narration-warning-deduction">خصم التنبيه</Label>
                <Input id="narration-warning-deduction" type="number" min="0" value={settings.narrationWarningDeduction} onChange={(event) => setSettings({ ...settings, narrationWarningDeduction: Number(event.target.value || 0) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="narration-mistake-deduction">خصم الخطأ</Label>
                <Input id="narration-mistake-deduction" type="number" min="0" value={settings.narrationMistakeDeduction} onChange={(event) => setSettings({ ...settings, narrationMistakeDeduction: Number(event.target.value || 0) })} />
              </div>
            </div>
          </SettingsGroup>


          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsPoints" activeCategory={activeCategory} title="النقاط والترتيب">
          <SettingsGroup>
            <h3 className="text-sm font-black text-primary">النقاط والترتيب</h3>
            <div className="space-y-3">
              <SettingToggle
                label="إظهار ترتيب الطلاب"
                checked={settings.studentRankingsVisible}
                onCheckedChange={(checked) => setSettings({ ...settings, studentRankingsVisible: checked })}
              />
              <SettingToggle
                label="إظهار ترتيب الحلقات"
                checked={settings.familyRankingsVisible}
                onCheckedChange={(checked) => setSettings({ ...settings, familyRankingsVisible: checked })}
              />
              {settings.familyRankingsVisible && (
                <div className="space-y-2 rounded-xl border border-border/70 bg-card/65 p-3">
                  <Label htmlFor="family-ranking-mode">طريقة احتساب ترتيب الحلقات</Label>
                  <Select
                    value={settings.familyRankingMode === 'average' ? 'average' : 'total'}
                    onValueChange={(value) => setSettings({ ...settings, familyRankingMode: value })}
                  >
                    <SelectTrigger id="family-ranking-mode" className="min-h-12 touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="total">إجمالي نقاط الحلقة</SelectItem>
                      <SelectItem value="average">متوسط نقاط الطلاب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(settings.studentRankingsVisible || settings.familyRankingsVisible) && (
                <SettingToggle
                  label="إظهار النقاط في الترتيب"
                  checked={settings.rankingPointsVisible}
                  onCheckedChange={(checked) => setSettings({ ...settings, rankingPointsVisible: checked })}
                />
              )}
              <InlineToggleNumberSetting
                label="السماح للمعلم بالإضافة والخصم"
                checked={settings.teacherManualPointsEnabled}
                onCheckedChange={(checked) => setSettings({ ...settings, teacherManualPointsEnabled: checked })}
                value={settings.teacherManualPointsTermLimit}
                onValueChange={(value) => setSettings({ ...settings, teacherManualPointsTermLimit: value })}
                inputLabel="حد المعلم في الفصل"
                valueLabel="الحد في الفصل"
                min={1}
                max={1000000}
              />
              {settings.teacherManualPointsEnabled && (
                <TeacherPointTypesSetting
                  value={settings.teacherPointTypes}
                  onChange={(teacherPointTypes) => setSettings({ ...settings, teacherPointTypes })}
                />
              )}
              {canResetPoints && (
                <div className="border-t border-border/70 pt-4">
                  <ResetPointsDialog />
                </div>
              )}
            </div>
          </SettingsGroup>
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsTrackSession" activeCategory={activeCategory} title="جلسة المسار">
            <GradingSettingsPanel section="track" onStatusChange={setPolicyStatus} />
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsWeeklySession" activeCategory={activeCategory} title="الجلسة الأسبوعية">
            <GradingSettingsPanel section="weekly" onStatusChange={setPolicyStatus} />
          </SettingsCategoryPanel>

          <SettingsCategoryPanel category="settingsTerm" activeCategory={activeCategory} title="إنهاء الفصل وطلبات الحذف">
          {canManageDeletionRequests && <SettingsGroup><AccountPolicyLinks>
            {settings.deletionRequestsSectionEnabled !== false && <AccountDeletionRequestsDialog triggerClassName="w-auto px-3 text-xs sm:text-sm" />}
          </AccountPolicyLinks></SettingsGroup>}
          {settings.termClosureSectionEnabled !== false && <SettingsGroup>
            <h3 className="text-sm font-black text-primary">إنهاء الفصل</h3>
            <p className="text-sm font-bold leading-7 text-muted-foreground">
              {termClosureSummary}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setEndTermOpen(true)}>
                إنهاء الفصل والبدء بفصل جديد
              </Button>
            </div>
          </SettingsGroup>}

          </SettingsCategoryPanel>
        </CardContent>
      </Card>}

      {<div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40">
        <output  aria-live="polite" className={`inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold shadow-xl ${
          showError
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-primary/20 bg-card text-muted-foreground'
        }`}>
          {showSaving ? <LoadingSpinner className="text-primary" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
          {_resolveSettingsSection()}
        </output>
      </div>}

      <EndTermDialog {...{ endTermOpen, setEndTermOpen, termClosureSummary, endTermConfirmText, setEndTermConfirmText, endTerm, isEndingTerm }} />
    </div>
  );
};

export default SettingsSection;
