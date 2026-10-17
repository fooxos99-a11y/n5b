import React, { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { Link } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PublicLegalFooter = ({ onDeleteAccount, compact = false, inverse = !compact }) => {
  const [open, setOpen] = useState(false);
  const legalLinkClass = `inline-flex min-h-11 items-center justify-center transition-colors focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${compact ? 'text-xs font-bold' : 'text-[11px] font-black'} ${inverse ? 'text-white/70 hover:text-white focus-visible:text-white' : 'text-primary/90 hover:text-primary focus-visible:text-primary'}`;
  return (
    <footer className={`${compact ? 'mt-4' : 'border-t border-[#dfa33b]/20 bg-[#06332f] px-4 py-6'} [font-family:var(--font-ui)]`} dir="rtl">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="link" className={legalLinkClass}>
              المساعدة والخصوصية
              <ChevronUp aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-60 max-w-[calc(100vw-2rem)] p-1 [font-family:var(--font-ui)]" dir="rtl" aria-label="المساعدة والخصوصية">
            <nav className="grid" aria-label="الروابط النظامية" onClick={() => setOpen(false)}>
              <Button asChild variant="ghost" className="justify-start"><Link to="/terms">شروط الاستخدام</Link></Button>
              <Button asChild variant="ghost" className="justify-start"><Link to="/privacy">سياسة الخصوصية</Link></Button>
              <Button asChild variant="ghost" className="justify-start"><Link to="/support">الدعم والمساعدة</Link></Button>
              {onDeleteAccount ? <Button type="button" variant="ghost" className="justify-start" onClick={onDeleteAccount}>طلب حذف الحساب</Button>
                : <Button asChild variant="ghost" className="justify-start"><Link to="/account-deletion">طلب حذف الحساب</Link></Button>}
            </nav>
          </PopoverContent>
        </Popover>
      </div>
    </footer>
  );
};

export default PublicLegalFooter;
