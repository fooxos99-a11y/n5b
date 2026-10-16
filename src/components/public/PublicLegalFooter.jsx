import React from 'react';
import { Link } from '@/lib/router';

const PublicLegalFooter = ({ onDeleteAccount, compact = false }) => {
  const legalLinkClass = `inline-flex min-h-11 items-center justify-center transition-colors focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${compact ? 'text-xs font-bold text-primary/90 hover:text-primary focus-visible:text-primary' : 'text-[11px] font-black text-white/70 hover:text-white focus-visible:text-white'}`;
  return (
    <footer className={`${compact ? 'mt-4' : 'border-t border-[#dfa33b]/20 bg-[#06332f] px-4 py-6'} [font-family:var(--font-ui)]`} dir="rtl">
      <div className="mx-auto w-full max-w-5xl">
        <nav className={`flex w-full flex-wrap items-center justify-center ${compact ? 'gap-x-4' : 'gap-x-6'} gap-y-1`} aria-label="الروابط النظامية">
          <Link className={legalLinkClass} to="/terms">شروط الاستخدام</Link>
          <Link className={legalLinkClass} to="/privacy">سياسة الخصوصية</Link>
          <Link className={legalLinkClass} to="/support">الدعم والمساعدة</Link>
          {onDeleteAccount ? <button type="button" className={legalLinkClass} onClick={onDeleteAccount}>طلب حذف الحساب</button>
            : <Link className={legalLinkClass} to="/account-deletion">طلب حذف الحساب</Link>}
        </nav>
      </div>
    </footer>
  );
};

export default PublicLegalFooter;
