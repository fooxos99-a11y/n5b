import React from 'react';
import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const messageTemplateVariables = [
  ['{name}', 'اسم الطالب'],
  ['{date}', 'تاريخ الموعد'],
  ['{committeeName}', 'اسم الحلقة'],
  ['{committee}', 'اسم الحلقة'],
  ['{login}', 'رقم الدخول'],
  ['{nationalId}', 'رقم الهوية'],
  ['{age}', 'العمر'],
  ['{tasks}', 'المهام غير المنفذة'],
  ['{eventName}', 'اسم يوم السرد'],
  ['{fromDate}', 'بداية يوم السرد'],
  ['{toDate}', 'نهاية يوم السرد'],
  ['{score}', 'درجة السرد'],
  ['{rating}', 'تقدير السرد'],
];

const MessageTemplateField = ({ id, label, value, onChange, placeholder, action }) => (
  <div className="space-y-2 [font-family:var(--font-ui)]">
    <div className="flex min-h-10 items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      {action}
    </div>
    <Textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-h-24 resize-y whitespace-pre-wrap bg-card"
    />
  </div>
);

export const TemplateVariablesHint = () => (
  <div className="group relative [font-family:var(--font-ui)]">
    <button
      type="button"
      className="flex h-11 w-11 items-center justify-center text-primary transition hover:text-primary/70"
      aria-label="متغيرات القالب"
    >
      <Info className="h-4 w-4" />
    </button>
    <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-primary/20 bg-popover p-3 text-right text-xs font-bold text-popover-foreground opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
      <div className="mb-2 text-sm font-black text-primary">متغيرات القالب</div>
      <div className="space-y-1.5">
        {messageTemplateVariables.map(([key, description]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <code className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{key}</code>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default MessageTemplateField;
