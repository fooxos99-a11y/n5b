import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import { formatPoints } from '@/lib/pointsFormat';

const emptyForm = { studentId: '', adjustmentTypeId: '', reason: '' };

const TeacherPointsAdjustmentSection = () => {
  const { toast } = useToast();
  const [students, setStudents] = useState([]);
  const [types, setTypes] = useState([]);
  const [term, setTerm] = useState({ limit: 0, used: 0, remaining: 0 });
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await studentsApi.getTeacherPointStudents();
      setStudents(data.students || []);
      setTypes(data.types || []);
      setTerm(data.term || { limit: 0, used: 0, remaining: 0 });
    } catch (error) {
      toast({ title: 'تعذر تحميل البيانات', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === form.studentId),
    [form.studentId, students],
  );
  const selectedType = useMemo(
    () => types.find((type) => type.id === form.adjustmentTypeId),
    [form.adjustmentTypeId, types],
  );
  const insufficientStudentBalance = selectedType?.operation === 'deduction'
    && Number(selectedStudent?.points || 0) < Number(selectedType.points || 0);
  const exceedsTermLimit = Number(selectedType?.points || 0) > Number(term.remaining || 0);
  const canSave = selectedStudent && selectedType && !insufficientStudentBalance && !exceedsTermLimit;

  const save = async () => {
    if (!canSave) {
      toast({ title: 'أكمل البيانات', description: 'اختر الطالب ونوعًا متاحًا للعملية.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const result = await studentsApi.adjustTeacherStudentPoints({
        studentId: selectedStudent.id,
        adjustmentTypeId: selectedType.id,
        reason: form.reason.trim(),
      });
      const signedPoints = result.type === 'increase' ? Number(result.points || 0) : -Number(result.points || 0);
      setStudents((current) => current.map((student) => (
        student.id === selectedStudent.id
          ? { ...student, points: Math.max(0, Number(student.points || 0) + signedPoints) }
          : student
      )));
      setTerm((current) => ({
        ...current,
        used: Number(current.used || 0) + Number(result.points || 0),
        remaining: Number(result.remaining || 0),
      }));
      setForm(emptyForm);
      toast({ title: result.type === 'increase' ? 'أضيفت النقاط' : 'خُصمت النقاط' });
    } catch (error) {
      toast({ title: 'تعذر حفظ العملية', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <DashboardLoader className="min-h-[360px]" />;

  const _resolveTeacherPointsAdjustmentSection = () => {
    if (students.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center font-bold text-muted-foreground">
              لا يوجد طلاب في حلقتك.
            </div>;
    }
    if (types.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center font-bold text-muted-foreground">
              لم تُضبط أنواع الإضافة والخصم من الإعدادات بعد.
            </div>;
    }
    return <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="teacher-points-student">اسم الطالب</Label>
                  <Select value={form.studentId} onValueChange={(studentId) => setForm((current) => ({ ...current, studentId }))}>
                    <SelectTrigger id="teacher-points-student" className="min-h-12 touch-manipulation">
                      <SelectValue placeholder="اختر الطالب" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={String(student.id)}>
                          {student.name} — {formatPoints(student.points)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacher-points-type">النوع</Label>
                  <Select value={form.adjustmentTypeId} onValueChange={(adjustmentTypeId) => setForm((current) => ({ ...current, adjustmentTypeId }))}>
                    <SelectTrigger id="teacher-points-type" className="min-h-12 touch-manipulation">
                      <SelectValue placeholder="اختر النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.label} — {type.operation === 'increase' ? 'إضافة' : 'خصم'} {formatPoints(type.points)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-points-reason">ملاحظة (اختياري)</Label>
                <Textarea
                  id="teacher-points-reason"
                  value={form.reason}
                  maxLength={400}
                  placeholder="أضف تفاصيل عند الحاجة"
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  className="min-h-24 resize-none"
                />
              </div>

              {insufficientStudentBalance && (
                <p className="text-sm font-bold text-destructive">رصيد الطالب لا يكفي لتنفيذ هذا الخصم.</p>
              )}
              {exceedsTermLimit && (
                <p className="text-sm font-bold text-destructive">قيمة النوع تتجاوز المتبقي للمعلم في الفصل.</p>
              )}

              <Button type="button" className="min-h-12 w-full touch-manipulation sm:w-auto sm:min-w-32" onClick={save} disabled={isSaving || !canSave} loading={isSaving}>
                حفظ
              </Button>
            </>;
  };
  return (
    <div className="space-y-4 [font-family:var(--font-ui)]" dir="rtl">
      <Card className="border-primary/30 bg-card">
        <CardHeader className="border-b border-primary/15 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-muted-foreground">
              المتبقي في الفصل: <span className="text-primary">{formatPoints(term.remaining)}</span> من {formatPoints(term.limit)}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          {_resolveTeacherPointsAdjustmentSection()}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherPointsAdjustmentSection;
