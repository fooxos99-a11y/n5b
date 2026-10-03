import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_TEACHER_POINT_TYPES, normalizeTeacherPointTypes } from '../../../shared/teacher-point-types.js';
import { secureRandomId } from '../../../shared/secure-random.js';

const createType = () => ({
  id: secureRandomId('type'),
  label: 'نوع خصم',
  operation: 'deduction',
  points: 1,
});

const updateOperation = (item, operation) => ({
  operation,
  ...(['', 'نوع خصم', 'نوع إضافة'].includes(String(item.label || '').trim())
    ? { label: operation === 'deduction' ? 'نوع خصم' : 'نوع إضافة' }
    : {}),
});

const TeacherPointTypesSetting = ({ value, onChange }) => {
  const types = Array.isArray(value) ? value : normalizeTeacherPointTypes(value);
  const update = (id, patch) => onChange(types.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/65 p-3 [font-family:var(--font-ui)]" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>أنواع الإضافة والخصم</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 touch-manipulation gap-2"
          disabled={types.length >= MAX_TEACHER_POINT_TYPES}
          onClick={() => onChange([...types, createType()])}
        >
          <Plus className="h-4 w-4" />
          إضافة نوع
        </Button>
      </div>

      {types.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm font-bold text-muted-foreground">
          أضف نوعًا واحدًا على الأقل ليستخدم مشرف المسار الإضافة أو الخصم.
        </p>
      ) : types.map((item, index) => (
        <div key={item.id} className="grid gap-3 rounded-lg border border-border/70 bg-background/60 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor={`teacher-point-type-label-${item.id}`}>اسم النوع</Label>
            <Input
              id={`teacher-point-type-label-${item.id}`}
              value={item.label}
              maxLength={80}
              placeholder="مثال: مخالفة سلوكية"
              className="min-h-11"
              onChange={(event) => update(item.id, { label: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`teacher-point-operation-${item.id}`}>العملية</Label>
            <Select value={item.operation} onValueChange={(operation) => update(item.id, updateOperation(item, operation))}>
              <SelectTrigger id={`teacher-point-operation-${item.id}`} className="min-h-11 touch-manipulation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">إضافة</SelectItem>
                <SelectItem value="deduction">خصم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`teacher-point-value-${item.id}`}>عدد النقاط</Label>
            <Input
              id={`teacher-point-value-${item.id}`}
              type="number"
              inputMode="numeric"
              min="1"
              max="1000000"
              value={item.points}
              className="min-h-11"
              onChange={(event) => update(item.id, { points: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 touch-manipulation text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`حذف النوع ${index + 1}`}
            onClick={() => onChange(types.filter((type) => type.id !== item.id))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
};

export default TeacherPointTypesSetting;
