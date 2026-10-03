import React from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeNumericInput } from '@/lib/numericInput';

export default function StudentBulkTable({ students, committees, disabled, onChange, onRemove }) {
  const complexes = [...new Map(committees.filter(row => row.complexId).map(row => [String(row.complexId), { id: String(row.complexId), name: row.complexName }])).values()];
  // This overflow region needs keyboard focus so arrow keys can scroll the wide table.
  return <div className="max-h-[60vh] min-w-0 overflow-auto rounded-xl border border-border" role="region" aria-label="مراجعة الطلاب قبل الإضافة" tabIndex={0}>
    <table className="w-full min-w-[1050px] border-collapse text-right text-sm">
      <thead className="sticky top-0 z-10 bg-muted"><tr>
        {['#', 'الاسم', 'رقم الدخول', 'كلمة المرور', 'جوال الطالب', 'جوال ولي الأمر', 'رقم الهوية', 'المجمع', 'الحلقة', 'حذف'].map(label => <th key={label} scope="col" className="whitespace-nowrap p-3">{label}</th>)}
      </tr></thead>
      <tbody>{students.map((student, index) => <tr key={student.rowId} className="border-t border-border">
        <th scope="row" className="p-2">{index + 1}</th>
        <td className="min-w-[12rem] p-2"><Input disabled={disabled} aria-label={`اسم الطالب ${index + 1}`} value={student.name} onChange={event => onChange(student.rowId, 'name', event.target.value)} /></td>
        <td className="min-w-[8rem] p-2"><Input disabled={disabled} aria-label={`رقم دخول الطالب ${index + 1}`} inputMode="numeric" value={student.loginNumber} onChange={event => onChange(student.rowId, 'loginNumber', normalizeNumericInput(event.target.value))} /></td>
        <td className="min-w-[9rem] p-2"><PasswordInput disabled={disabled} required aria-label={`كلمة مرور الطالب ${index + 1}`} autoComplete="new-password" value={student.password} onChange={event => onChange(student.rowId, 'password', event.target.value)} /></td>
        <td className="min-w-[10rem] p-2"><Input disabled={disabled} aria-label={`جوال الطالب ${index + 1}`} inputMode="tel" value={student.phone || ''} onChange={event => onChange(student.rowId, 'phone', event.target.value)} /></td>
        <td className="min-w-[10rem] p-2"><Input disabled={disabled} aria-label={`جوال ولي الأمر ${index + 1}`} inputMode="tel" value={student.guardianPhone} onChange={event => onChange(student.rowId, 'guardianPhone', event.target.value)} /></td>
        <td className="min-w-[10rem] p-2"><Input disabled={disabled} aria-label={`رقم هوية الطالب ${index + 1}`} inputMode="numeric" value={student.nationalId} onChange={event => onChange(student.rowId, 'nationalId', event.target.value)} /></td>
        <td className="min-w-[10rem] p-2"><Select disabled={disabled} value={student.complexId || ''} onValueChange={value => onChange(student.rowId, 'complexId', value)}>
          <SelectTrigger aria-label={`مجمع الطالب ${index + 1}`}><SelectValue placeholder="اختر المجمع" /></SelectTrigger>
          <SelectContent>{complexes.map(complex => <SelectItem key={complex.id} value={complex.id}>{complex.name}</SelectItem>)}</SelectContent>
        </Select></td>
        <td className="min-w-[10rem] p-2"><Select disabled={disabled || !student.complexId} value={student.committeeId} onValueChange={value => onChange(student.rowId, 'committeeId', value)}>
          <SelectTrigger aria-label={`حلقة الطالب ${index + 1}`}><SelectValue placeholder="اختر الحلقة" /></SelectTrigger>
          <SelectContent>{committees.filter(committee => String(committee.complexId || '') === student.complexId).map(committee => <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>)}</SelectContent>
        </Select></td>
        <td className="p-2"><ManagementIconButton disabled={disabled} onClick={() => onRemove(student.rowId)} tone="destructive" aria-label={`حذف الطالب ${index + 1} من القائمة`}><Trash2 className="h-4 w-4" /></ManagementIconButton></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
