import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Pencil, Plus, Repeat, Trash2, Upload } from 'lucide-react';
import { filterRosterByName } from '@/lib/rosterSearch';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementRow, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { studentsApi } from '@/services/studentsApi';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { readSpreadsheetSheets, parseBestStudentSheet, updateImportedStudent } from '@/lib/studentImport';
import StudentBulkTable from './StudentBulkTable';

const emptyStudent = {
  name: '',
  loginNumber: '',
  password: '',
  nationalId: '',
  guardianPhone: '',
  committeeId: '',
  gradeAdjustmentType: 'increase',
  gradeAdjustmentAmount: '',
  gradeAdjustmentReason: '',
};

const StudentsSection = () => {
  const [search, setSearch] = useState('');
  const isOnline = useOnlineStatus();
  const accountId = Number(localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id') || 0);
  const actorRole = localStorage.getItem('wajeh_role') || 'manager';
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [committees, setCommittees] = useState([]);
  const [students, setStudents] = useState([]);
  const visibleStudents = useMemo(() => filterRosterByName(students, search), [students, search]);
  const [committeeFilter, setCommitteeFilter] = useState('all');
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [moveCommitteeId, setMoveCommitteeId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkStudents, setBulkStudents] = useState([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const gradeAdjustment = describeGradeAdjustment(selectedStudent?.points, studentForm);

  const selectedCommitteeName = useMemo(() => {
    return committees.find((committee) => String(committee.id) === String(moveCommitteeId))?.name || '';
  }, [committees, moveCommitteeId]);

  const loadCommittees = async () => {
    const data = await loadOfflineSnapshot(accountId, 'management:committees', () => studentsApi.getCommittees(), { actorRole });
    setCommittees(data);
  };

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadOfflineSnapshot(
        accountId,
        `management:students:${committeeFilter}`,
        () => studentsApi.getStudents({ committeeId: committeeFilter }),
        { actorRole },
      );
      setStudents(data);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, actorRole, committeeFilter]);

  useEffect(() => {
    loadCommittees().catch((error) => {
      toast({ title: "تعذر تحميل الحلقات", description: error.message, variant: 'destructive' });
    });
  }, [toast]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadStudents().catch((error) => {
        toast({ title: "تعذر تحميل الطلاب", description: error.message, variant: 'destructive' });
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadStudents, toast]);

  const resetForm = () => {
    setStudentForm(emptyStudent);
    setSelectedStudent(null);
    setBulkStudents([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAddDialog = () => {
    resetForm();
    setDialog('add');
  };

  const openEditDialog = (student) => {
    setSelectedStudent(student);
    setStudentForm({
      name: student.name,
      loginNumber: student.loginNumber,
      password: '',
      nationalId: student.nationalId || '',
      guardianPhone: student.guardianPhone,
      committeeId: student.committeeId ? String(student.committeeId) : '',
      gradeAdjustmentType: 'increase',
      gradeAdjustmentAmount: '',
      gradeAdjustmentReason: '',
    });
    setDialog('edit');
  };

  const saveStudent = async () => {
    if (dialog === 'add' && bulkStudents.length > 0) {
      await saveBulkStudents();
      return;
    }

    if (!studentForm.loginNumber.trim() || (dialog === 'add' && !studentForm.password)) {
      toast({ title: 'أدخل رقم الدخول وكلمة المرور.', variant: 'destructive' });
      return;
    }
    if (!studentForm.committeeId) {
      toast({ title: 'الحلقة مطلوبة', description: 'اختر حلقة للطالب قبل الحفظ.', variant: 'destructive' });
      return;
    }

    try {
      if (dialog === 'edit' && selectedStudent) {
        if (gradeAdjustment.error) {
          toast({ title: 'تعذر تعديل الرصيد', description: gradeAdjustment.error, variant: 'destructive' });
          return;
        }
        const result = await studentsApi.updateStudent(selectedStudent.id, studentForm);
        toast(gradeAdjustment.amount
          ? { title: 'تم تعديل الرصيد', description: `الرصيد الحالي: ${formatGrades(result?.points ?? gradeAdjustment.next)} درجة` }
          : { title: 'تم التحديث', description: 'تم تحديث بيانات الطالب.' });
      } else {
        await studentsApi.createStudent(studentForm);
        toast({ title: "تم الحفظ", description: "تمت إضافة الطالب وربطه بالحلقة." });
      }
      setDialog(null);
      resetForm();
      await loadStudents();
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error.message, variant: 'destructive' });
    }
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const sheets = await readSpreadsheetSheets(file);
      const allStudents = await studentsApi.getStudents({ committeeId: 'all', search: '' }).catch(() => students);
      const usedLoginNumbers = new Set(allStudents.map((student) => String(student.loginNumber)));
      const { parsed } = parseBestStudentSheet(sheets, usedLoginNumbers, committees);

      if (!parsed.length) {
        toast({ title: 'لم يتم العثور على طلاب', description: 'تأكد من وجود عمود الاسم، أو ضع الاسم في العمود A.', variant: 'destructive' });
        return;
      }

      setBulkStudents(parsed);
      toast({ title: 'تم قراءة الملف', description: `تم استخراج ${parsed.length} طالب.` });
    } catch (error) {
      toast({ title: 'تعذر قراءة ملف Excel', description: `${error.message} - تأكد أن الملف بصيغة .xlsx وليس .xls.`, variant: 'destructive' });
    } finally {
      event.target.value = '';
    }
  };

  const updateBulkStudent = (rowId, field, value) => {
    setBulkStudents((current) =>
      current.map((student) => student.rowId === rowId ? updateImportedStudent(student, field, value) : student)
    );
  };

  const removeBulkStudent = (rowId) => {
    setBulkStudents((current) => current.filter((student) => student.rowId !== rowId));
  };

  const saveBulkStudents = async () => {
    const invalid = bulkStudents.some((student) =>
      !student.name.trim() || !String(student.loginNumber).trim() || !student.password || !student.committeeId
    );

    if (invalid) {
      toast({ title: 'بيانات ناقصة', description: 'تأكد من الاسم ورقم الدخول وكلمة المرور والحلقة لكل طالب.', variant: 'destructive' });
      return;
    }

    setIsBulkSaving(true);
    try {
      const payload = bulkStudents.map(({ rowId: _rowId, ...student }) => student);
      const result = await studentsApi.createStudentsBulk(payload);
      toast({ title: 'تم الحفظ', description: `تمت إضافة ${result.count || payload.length} طالب.` });
      setDialog(null);
      resetForm();
      await loadStudents();
    } catch (error) {
      toast({ title: 'تعذر حفظ الطلاب', description: error.message, variant: 'destructive' });
    } finally {
      setIsBulkSaving(false);
    }
  };

  const confirmDelete = (student) => {
    setSelectedStudent(student);
    setDialog('delete');
  };

  const deleteStudent = async () => {
    if (!selectedStudent) return;
    try {
      await studentsApi.deleteStudent(selectedStudent.id);
      toast({ title: "تم الحذف", description: "تم حذف الطالب." });
      setDialog(null);
      setSelectedStudent(null);
      await loadStudents();
    } catch (error) {
      toast({ title: "تعذر الحذف", description: error.message, variant: 'destructive' });
    }
  };

  const openMoveDialog = (student) => {
    setSelectedStudent(student);
    setMoveCommitteeId(student.committeeId ? String(student.committeeId) : '');
    setDialog('move');
  };

  const moveStudent = async () => {
    if (!selectedStudent) return;
    if (!moveCommitteeId) {
      toast({ title: 'الحلقة مطلوبة', description: 'اختر حلقة لنقل الطالب إليها.', variant: 'destructive' });
      return;
    }
    try {
      await studentsApi.moveStudent(selectedStudent.id, moveCommitteeId);
      toast({ title: "تم النقل", description: `تم نقل الطالب إلى ${selectedCommitteeName}.` });
      setDialog(null);
      setSelectedStudent(null);
      await loadStudents();
    } catch (error) {
      toast({ title: "تعذر النقل", description: error.message, variant: 'destructive' });
    }
  };

  const rowActionClass = 'h-11 w-11 border-transparent bg-transparent';
  const _resolveStudentsSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (visibleStudents.length === 0) {
      return <ManagementEmpty>{search.trim() ? 'لا توجد نتائج مطابقة.' : 'لا يوجد طلاب حالياً.'}</ManagementEmpty>;
    }
    return <ManagementList label="الطلاب">
      {visibleStudents.map((student) => (
        <ManagementRow
          key={student.id}
          title={student.name}
          subtitle={student.committeeName || 'بدون حلقة'}
          onOpen={isOnline ? () => openEditDialog(student) : undefined}
          openLabel={`تعديل ${student.name}`}
          actions={<>
            <ManagementIconButton className={rowActionClass} disabled={!isOnline} onClick={() => openEditDialog(student)} title="تعديل الطالب" aria-label={`تعديل ${student.name}`} tone="primary">
              <Pencil className="h-4 w-4" />
            </ManagementIconButton>
            <ManagementIconButton className={rowActionClass} disabled={!isOnline} onClick={() => openMoveDialog(student)} title="نقل الطالب" aria-label={`نقل ${student.name}`}>
              <Repeat className="h-4 w-4" />
            </ManagementIconButton>
            <ManagementIconButton className={rowActionClass} disabled={!isOnline} onClick={() => confirmDelete(student)} title="الحذف" aria-label={`حذف ${student.name}`} tone="destructive">
              <Trash2 className="h-4 w-4" />
            </ManagementIconButton>
          </>}
        />
      ))}
    </ManagementList>;
  };
  return (
    <>
      {!isOnline ? <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-bold text-amber-700 sm:px-6">عرض محلي للقراءة فقط حتى عودة الاتصال.</div> : null}
      <ManagementToolbar>
        <Input type="search" aria-label="ابحث باسم الطالب" placeholder="ابحث باسم الطالب" value={search} onChange={event => setSearch(event.target.value)} className="h-11 flex-1 basis-56" />
        <Select value={committeeFilter} onValueChange={setCommitteeFilter}>
          <SelectTrigger aria-label="اختر الحلقة" className="h-11 flex-1 basis-40 sm:max-w-56">
            <SelectValue placeholder="اختر الحلقة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحلقات</SelectItem>
            {committees.map((committee) =>
            <SelectItem key={committee.id} value={String(committee.id)}>
                {committee.name}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button onClick={openAddDialog} disabled={!isOnline} className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" />إضافة طالب
        </Button>
      </ManagementToolbar>
      {_resolveStudentsSection()}

      <Dialog open={dialog === 'add' || dialog === 'edit'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className={`bg-card border-primary/30 text-foreground ${bulkStudents.length > 0 ? 'sm:max-w-7xl' : ''}`} dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">
              {dialog === 'edit' ? "تعديل بيانات الطالب" : "إضافة طالب"}
            </DialogTitle>
          </DialogHeader>
          {dialog === 'add' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
              <div className="text-sm text-muted-foreground">
                أعمدة Excel: الاسم، جوال ولي الأمر، الهوية، الحلقة، رقم الدخول، كلمة المرور. عند ترك الرقم والرمز فارغين يُولّدان بالقيمة نفسها، ويمكن تعديلهما قبل الحفظ.
              </div>
              <Input
                aria-label="ملف الطلاب"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={handleExcelUpload}
                className="hidden"
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                رفع ملف اكسيل
              </Button>
            </div>
          )}
          {dialog === 'add' && bulkStudents.length > 0 ? (
            <StudentBulkTable students={bulkStudents} committees={committees} disabled={isBulkSaving} onChange={updateBulkStudent} onRemove={removeBulkStudent} />
          ) : (
            <div className="space-y-5 py-2">
              <FormGrid>
                <FormField label="اسم الطالب" htmlFor="student-name" wide>
                  <Input id="student-name" aria-label="اسم الطالب" value={studentForm.name} onChange={(event) => setStudentForm({ ...studentForm, name: event.target.value })} />
                </FormField>
                <FormField label="الحلقة" htmlFor="student-committee">
                  <Select value={studentForm.committeeId} onValueChange={(value) => setStudentForm({ ...studentForm, committeeId: value })}>
                    <SelectTrigger id="student-committee" aria-label="حلقة الطالب" className="h-11">
                      <SelectValue placeholder="اختر الحلقة" />
                    </SelectTrigger>
                    <SelectContent>
                      {committees.map((committee) =>
                      <SelectItem key={committee.id} value={String(committee.id)}>
                          {committee.name}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="رقم الدخول" htmlFor="student-login-number">
                  <Input id="student-login-number" aria-label="رقم الدخول" value={studentForm.loginNumber} onChange={(event) => setStudentForm({ ...studentForm, loginNumber: event.target.value })} />
                </FormField>
                <FormField label="رقم الجوال" htmlFor="student-phone">
                  <Input id="student-phone" aria-label="رقم الجوال" inputMode="tel" value={studentForm.guardianPhone} onChange={(event) => setStudentForm({ ...studentForm, guardianPhone: event.target.value })} />
                </FormField>
                <FormField label={dialog === 'edit' ? 'كلمة مرور جديدة' : 'كلمة المرور'} htmlFor="student-password">
                  <PasswordInput id="student-password" required={dialog === 'add'} autoComplete="new-password" value={studentForm.password} onChange={(event) => setStudentForm({ ...studentForm, password: event.target.value })} />
                  {dialog === 'edit' && <p className="text-xs text-muted-foreground">اتركها فارغة للإبقاء على كلمة المرور الحالية.</p>}
                </FormField>
                <FormField label="رقم الهوية" htmlFor="student-national-id">
                  <Input id="student-national-id" aria-label="رقم الهوية" inputMode="numeric" value={studentForm.nationalId} onChange={(event) => setStudentForm({ ...studentForm, nationalId: event.target.value })} />
                </FormField>
              </FormGrid>
              {dialog === 'edit' && (
                <div className="space-y-3 border-t border-border pt-4 [font-family:var(--font-ui)]">
                  <p className="text-sm font-black text-foreground" aria-live="polite">
                    الرصيد الحالي: <span className="tabular-nums">{formatGrades(selectedStudent?.points)}</span> درجة
                  </p>
                  <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2">
                    <Select value={studentForm.gradeAdjustmentType} onValueChange={(gradeAdjustmentType) => setStudentForm({ ...studentForm, gradeAdjustmentType })}>
                      <SelectTrigger aria-label="نوع تعديل الرصيد" className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="increase">إضافة</SelectItem>
                        <SelectItem value="deduction">خصم</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      aria-label="عدد الدرجات"
                      aria-invalid={Boolean(gradeAdjustment.error)}
                      aria-describedby={gradeAdjustment.error ? 'student-grade-adjustment-error' : undefined}
                      placeholder="عدد الدرجات"
                      value={studentForm.gradeAdjustmentAmount}
                      onKeyDown={(event) => { if (['-', '+', 'e', 'E'].includes(event.key)) event.preventDefault(); }}
                      onChange={(event) => setStudentForm({ ...studentForm, gradeAdjustmentAmount: event.target.value.replace(/-/g, '') })}
                    />
                  </div>
                  {gradeAdjustment.error && <p id="student-grade-adjustment-error" role="alert" className="text-xs font-bold text-destructive">{gradeAdjustment.error}</p>}
                  {gradeAdjustment.amount > 0 && !gradeAdjustment.error && (
                    <>
                      <p className="text-xs font-bold text-muted-foreground">يصبح الرصيد <span className="tabular-nums text-foreground">{formatGrades(gradeAdjustment.next)}</span> درجة</p>
                      <div className="space-y-2">
                        <Label htmlFor="student-grade-adjustment-reason">سبب التعديل</Label>
                        <Input
                          id="student-grade-adjustment-reason"
                          value={studentForm.gradeAdjustmentReason}
                          onChange={(event) => setStudentForm({ ...studentForm, gradeAdjustmentReason: event.target.value })}
                          placeholder="اكتب سبب الإضافة أو الخصم"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
            <Button onClick={saveStudent} disabled={isBulkSaving}>{isBulkSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'move'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">نقل الطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>اسم الطالب</Label>
              <Input aria-label="اسم الطالب" value={selectedStudent?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>اختر الحلقة المراد نقل الطالب إليها</Label>
              <Select value={moveCommitteeId} onValueChange={setMoveCommitteeId}>
                <SelectTrigger aria-label="الحلقة المراد نقل الطالب إليها">
                  <SelectValue placeholder="اختر الحلقة" />
                </SelectTrigger>
                <SelectContent>
                  {committees.map((committee) =>
                  <SelectItem key={committee.id} value={String(committee.id)}>
                      {committee.name}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
            <Button onClick={moveStudent}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            هل تريد حذف الطالب {selectedStudent?.name}؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
            <Button variant="destructive" onClick={deleteStudent}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);

};

export default StudentsSection;

const formatGrades = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

/** «إضافة / خصم» preview: the balance after saving, or why the change is not allowed. */
function describeGradeAdjustment(currentBalance, form) {
  const current = Number(currentBalance || 0);
  const text = String(form.gradeAdjustmentAmount ?? '').trim();
  const amount = text ? Number(text) : 0;
  if (!Number.isFinite(amount) || amount < 0) return { amount: 0, next: current, error: 'أدخل عدد درجات صحيحًا بدون سالب.' };
  const next = Math.round((current + (form.gradeAdjustmentType === 'deduction' ? -amount : amount)) * 100) / 100;
  if (next < 0) return { amount, next, error: `لا يمكن خصم أكثر من الرصيد الحالي (${formatGrades(current)} درجة).` };
  return { amount, next, error: '' };
}
