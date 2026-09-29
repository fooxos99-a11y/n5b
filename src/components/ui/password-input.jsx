import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';

export default function PasswordInput({ className, disabled, ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return <div className="relative [font-family:var(--font-ui)]">
    <Input {...props} disabled={disabled} type={visible ? 'text' : 'password'} maxLength={256} className={cn('pl-14', className)} />
    <Button type="button" variant="ghost" size="icon" disabled={disabled}
      className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9397a2] hover:-translate-y-1/2"
      aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={visible}
      onClick={() => setVisible(value => !value)}><Icon className="h-6 w-6" aria-hidden="true" /></Button>
  </div>;
}
