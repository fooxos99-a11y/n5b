import React from 'react';
import { Link } from '@/lib/router';

const legalLinkClass = 'inline-flex min-h-9 items-center px-0.5 font-black text-primary underline underline-offset-4';

const LegalConsentText = ({ prefix, className = '', stacked = false }) => (
  <p className={`text-center text-[11px] font-semibold leading-5 text-muted-foreground ${className}`}>
    <span className={stacked ? 'block' : ''}>{prefix}</span>{' '}
    <span className={stacked ? '-mt-1 flex items-center justify-center gap-1' : ''}>
      <Link className={legalLinkClass} to="/terms">شروط الاستخدام</Link>
      <span aria-hidden="true">و</span>
      <Link className={legalLinkClass} to="/privacy">سياسة الخصوصية</Link>
    </span>
  </p>
);

export default LegalConsentText;
