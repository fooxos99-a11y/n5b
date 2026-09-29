import React from 'react';
import { Building2, KeyRound, Phone, User, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import OwnerField from '@/components/owner/OwnerField';

const OwnerComplexDialog = ({
  open,
  onOpenChange,
  editingComplex,
  form,
  setForm,
  onSave,
  saving,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl border-border/80 bg-card p-0" dir="rtl">
      <DialogHeader className="border-b border-border/70 px-4 py-4 sm:px-5">
        <DialogTitle className="text-xl font-black text-foreground">
          {editingComplex ? 'تعديل بيانات المجمع' : 'إضافة مجمع جديد'}
        </DialogTitle>
      </DialogHeader>

      <div className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2 sm:p-5">
        <OwnerField
          label="اسم المجمع"
          icon={Building2}
          value={form.name}
          placeholder="اسم المجمع"
          onChange={(name) => setForm({ ...form, name })}
        />
        <OwnerField
          label="رقم المجمع"
          icon={KeyRound}
          value={form.registrationNumber}
          inputMode="numeric"
          placeholder="مثال: 101"
          onChange={(registrationNumber) => setForm({ ...form, registrationNumber })}
        />
        <OwnerField
          label="مسؤول التواصل"
          icon={User}
          value={form.contactName}
          placeholder="اسم المسؤول"
          onChange={(contactName) => setForm({ ...form, contactName })}
        />
        <OwnerField
          label="رقم التواصل"
          icon={Phone}
          value={form.contactPhone}
          inputMode="tel"
          placeholder="05xxxxxxxx"
          onChange={(contactPhone) => setForm({ ...form, contactPhone })}
        />
        <OwnerField
          label="اسم المدير"
          icon={UserCog}
          value={form.managerName}
          placeholder="اسم المدير"
          onChange={(managerName) => setForm({ ...form, managerName })}
        />
        <OwnerField
          label="رقم دخول المدير"
          icon={KeyRound}
          value={form.managerLoginNumber}
          inputMode="numeric"
          placeholder="مثال: 123"
          onChange={(managerLoginNumber) => setForm({ ...form, managerLoginNumber })}
        />
      </div>

      <DialogFooter className="border-t border-border/70 bg-card px-4 py-3 sm:px-6 sm:py-4">
        <Button type="button" variant="outline" className="h-11 min-w-24 rounded-xl" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
        <Button type="button" className="h-11 min-w-28 rounded-xl" loading={saving} onClick={onSave}>
          {editingComplex ? 'حفظ التعديلات' : 'إنشاء المجمع'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default OwnerComplexDialog;
