import React from 'react';
import { ExternalLink, Mail } from 'lucide-react';
import PublicInfoLayout from '@/components/legal/PublicInfoLayout';
import { Button } from '@/components/ui/button';

const SupportPage = () => {
  return (
    <PublicInfoLayout title="الدعم والمساعدة">
      <p className="text-muted-foreground">للمساعدة في استخدام برنامج نخب التعليمي أو حل مشكلة في حسابك، تواصل معنا عبر واتساب أو البريد الإلكتروني.</p>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <h2 className="mb-2 text-lg font-black">قبل التواصل</h2>
        <p className="text-muted-foreground">أرسل وصفًا مختصرًا للمشكلة، ولا تشارك كلمة المرور.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild className="min-h-11 gap-2 rounded-xl">
          <a href="https://wa.me/966539599222" target="_blank" rel="noopener noreferrer">
            واتساب <span dir="ltr">0539599222</span> <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
        <Button asChild variant="outline" className="min-h-11 gap-2 rounded-xl">
          <a href="mailto:wajeh_@outlook.com" aria-label="البريد الإلكتروني: wajeh_@outlook.com">
            <Mail className="h-4 w-4" aria-hidden="true" /> <span dir="ltr">wajeh_@outlook.com</span>
          </a>
        </Button>
      </div>
    </PublicInfoLayout>
  );
};

export default SupportPage;
