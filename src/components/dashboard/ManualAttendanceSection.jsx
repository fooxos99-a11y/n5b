import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import ErrorState from '@/components/ui/error-state';
import { ManagementEmpty, ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../../shared/business-date.js';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

const toDateOnly = getBusinessDate;

const today = () => toDateOnly(new Date());

const defaultSessionDays = [0, 1, 2, 3, 4];

const isDateOnly = (value) => {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const normalizeSessionDays = (days) => {
  const normalized = [...new Set((Array.isArray(days) ? days : defaultSessionDays).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return normalized.length ? normalized : defaultSessionDays;
};

const addUtcDays = (dateValue, days) => {
  const parsed = new Date(`${dateValue}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getSessionDate = (dateValue = today(), sessionDays = defaultSessionDays) => {
  const baseDate = isDateOnly(dateValue) ? String(dateValue) : today();
  const days = normalizeSessionDays(sessionDays);
  let offset = 0;
  while (!days.includes(new Date(`${addUtcDays(baseDate, -offset)}T00:00:00Z`).getUTCDay()) && offset <= 7) {
    offset += 1;
  }
  return addUtcDays(baseDate, -offset);
};

const sessionDayLabel = (dateValue) => {
  return new Date(`${dateValue}T00:00:00Z`).toLocaleDateString('ar-SA', {
    weekday: 'long',
    timeZone: 'Asia/Riyadh',
  });
};

const attendanceStatuses = [
  { key: 'present', label: 'حاضر' },
  { key: 'late', label: 'متأخر' },
  { key: 'absent', label: 'غائب' },
  { key: 'excused', label: 'مستأذن' },
];

const statusLabel = (status) => {
  if (status === 'no_session') return 'لا توجد جلسة في هذا اليوم';
  if (status === 'present') return 'حاضر';
  if (status === 'late') return 'متأخر';
  if (status === 'absent') return 'غائب';
  if (status === 'excused') return 'مستأذن';
  return 'اختر الحالة';
};

const ManualAttendanceSection = ({ teacherScoped = false }) => {
  const { toast } = useToast();
  const [target, setTarget] = useState('students');
  const [attendanceDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date') || today();
    return isDateOnly(date) ? String(date) : today();
  });
  const [sessionDays, setSessionDays] = useState(defaultSessionDays);
  const [committeeId, setCommitteeId] = useState('all');
  const [committees, setCommittees] = useState([]);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingIds, setPendingIds] = useState([]);
  const sessionDate = useMemo(() => getSessionDate(attendanceDate, sessionDays), [attendanceDate, sessionDays]);
  const effectiveDate = target === 'students' ? sessionDate : attendanceDate;
  const headerDate = effectiveDate;
  const headerLabel = target === 'students' ? `جلسة ${sessionDayLabel(sessionDate)}` : sessionDayLabel(attendanceDate);

  const groupedRows = useMemo(() => {
    return [{ title: target, rows }];
  }, [rows, target]);

  const updateRowStatus = (id, status) => {
    setRows((current) => current.map((item) => (
      Number(item.id) === Number(id)
        ? { ...item, status, recordDate: effectiveDate }
        : item
    )));
  };

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      if (target === 'students') {
        setRows(await studentsApi.getStudentReport({ date: effectiveDate, committeeId }));
      } else {
        setRows(await studentsApi.getSupervisorReport({ date: effectiveDate }));
      }
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل التحضير.');
    } finally {
      setIsLoading(false);
    }
  }, [committeeId, effectiveDate, target]);

  useEffect(() => {
    if (!teacherScoped) {
      studentsApi.getCommittees().then(setCommittees).catch((error) => {
        toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
      });
    }
    studentsApi.getPublicSettings().then((settings) => {
      setSessionDays(normalizeSessionDays(settings?.recitationSessionDays));
    }).catch(() => {
      setSessionDays(defaultSessionDays);
    });
  }, [teacherScoped, toast]);

  useEffect(() => {
    loadRows().catch((error) => {
      toast({ title: 'تعذر تحميل التحضير', description: error.message, variant: 'destructive' });
    });
  }, [loadRows, toast]);

  const setAttendanceStatus = async (row, status) => {
    if (pendingIds.includes(row.id) || row.status === status) return;
    setPendingIds((current) => [...current, row.id]);
    try {
      const payload = { date: effectiveDate, mode: 'manual', status };
      let result;
      if (target === 'students') {
        if (status === 'absent') {
          result = await studentsApi.markStudentAbsent(row.id, payload);
        } else {
          result = await studentsApi.checkInStudent(row.id, payload);
        }
      } else if (status === 'absent') {
          result = await studentsApi.markSupervisorAbsent(row.id, payload);
        } else {
          result = await studentsApi.checkInSupervisor(row.id, payload);
        }

      updateRowStatus(row.id, result.status || status);
      toast({
        title: 'تم تحديث التحضير',
        description: `${row.name}: ${statusLabel(result.status || status)}`,
      });
    } catch (error) {
      toast({ title: 'تعذر تحديث التحضير', description: error.message, variant: 'destructive' });
    } finally {
      setPendingIds((current) => current.filter((id) => Number(id) !== Number(row.id)));
    }
  };

  const _resolveManualAttendanceSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (loadError) return <ErrorState message={loadError} onRetry={loadRows} />;
    if (rows.length === 0) {
      return <ManagementEmpty>لا توجد بيانات للتحضير.</ManagementEmpty>;
    }
    return <>
      {groupedRows.map((group) => (
        <ManagementList key={group.title} label="التحضير">
          {group.rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-foreground">{row.name}</p>
                {target === 'supervisors' && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{row.jobTitle || 'مشرف المسار'}</p>
                )}
              </div>
              {row.status === 'no_session' ? (
                <p className="max-w-[45%] shrink-0 text-left text-sm font-bold text-muted-foreground">
                  {statusLabel(row.status)}
                </p>
              ) : (
                <Select
                  value={row.status || ''}
                  onValueChange={(value) => setAttendanceStatus(row, value)}
                  disabled={pendingIds.includes(row.id)}
                >
                  <SelectTrigger aria-label={`حالة حضور ${row.name}`} className="h-11 w-32 shrink-0 bg-background px-3 pl-8 text-foreground">
                    <SelectValue placeholder="اختر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    {attendanceStatuses.map(({ key, label }) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          ))}
        </ManagementList>
      ))}
    </>;
  };
  return (
    <>
      <DashboardMobileHeaderActions>
        <div className="flex min-h-11 flex-col justify-center whitespace-nowrap text-left" aria-label="موعد التحضير">
          <span className="text-xs font-black text-foreground">{headerLabel}</span>
          <time dateTime={headerDate} className="text-[11px] font-bold text-primary">{formatHijriDate(headerDate)}</time>
        </div>
      </DashboardMobileHeaderActions>
      <ManagementPanel>
      {!teacherScoped && (
        <ManagementToolbar>
          <Label className="sr-only">الفئة</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger aria-label="الفئة" className="h-11 flex-1 basis-40 sm:max-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="students">طلاب</SelectItem>
              <SelectItem value="supervisors">مشرفي المسارات والإدارة</SelectItem>
            </SelectContent>
          </Select>

          {target === 'students' && (
            <>
              <Label className="sr-only">الحلقة</Label>
              <Select value={committeeId} onValueChange={setCommitteeId}>
                <SelectTrigger aria-label="الحلقة" className="h-11 flex-1 basis-40 sm:max-w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحلقات</SelectItem>
                  {committees.map((committee) => (
                    <SelectItem key={committee.id} value={String(committee.id)}>
                      {committee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

        </ManagementToolbar>
      )}
      {_resolveManualAttendanceSection()}
      </ManagementPanel>
    </>
  );
};

export default ManualAttendanceSection;
