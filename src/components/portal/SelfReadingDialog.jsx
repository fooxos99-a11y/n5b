import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/dashboard/layout/ManagementPanel';

/** Arabic-Indic digits and the Arabic decimal separator are accepted in the faces field. */
const toLatinNumber = (value) => String(value || '')
  .replace(/[٠-٩]/g, (digit) => String(digit.codePointAt(0) - 1632))
  .replace(/[۰-۹]/g, (digit) => String(digit.codePointAt(0) - 1776))
  .replace(/[٫,]/g, '.');

/** Records a student's daily self reading: the faces read (prefilled from the plan), or not read. */
export default function SelfReadingDialog({ entry, studentName, isSaving = false, onSave, onOpenChange }) {
  const [faces, setFaces] = useState('');
  useEffect(() => {
    if (entry) setFaces(String(entry.recordedFaces ?? entry.faces ?? ''));
  }, [entry]);
  const parsedFaces = Number(toLatinNumber(faces));
  const validFaces = Number.isFinite(parsedFaces) && parsedFaces > 0;
  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-sm [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader>
          <DialogTitle>القراءة الذاتية — {studentName}</DialogTitle>
        </DialogHeader>
        <FormField label="عدد الأوجه" htmlFor="self-reading-faces">
          <Input
            id="self-reading-faces"
            inputMode="decimal"
            value={faces}
            onChange={(event) => setFaces(event.target.value)}
            aria-invalid={!validFaces}
            className="h-11 text-center text-base font-bold tabular-nums"
            dir="ltr"
          />
        </FormField>
        <DialogFooter className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={isSaving} onClick={() => onSave({ completed: false, faces: validFaces ? parsedFaces : entry?.faces })}>
            لم يقرأ
          </Button>
          <Button type="button" className="h-11" disabled={isSaving || !validFaces} loading={isSaving} onClick={() => onSave({ completed: true, faces: parsedFaces })}>
            نعم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
