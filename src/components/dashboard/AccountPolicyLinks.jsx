import React from 'react';
import { Link } from '@/lib/router';
import { Button } from '@/components/ui/button';

export default function AccountPolicyLinks({ children }) {
  return <nav aria-label="الروابط النظامية" className="flex flex-wrap gap-2 [font-family:var(--font-ui)]" dir="rtl">
    {[['/terms', 'شروط الاستخدام'], ['/privacy', 'سياسة الخصوصية'], ['/account-deletion', 'طلب حذف الحساب']].map(([to, label]) => (
      <Button key={to} asChild variant="outline"><Link to={to}>{label}</Link></Button>
    ))}
    {children}
  </nav>;
}
