import React from 'react';
import { ExternalLink } from 'lucide-react';
import PublicInfoLayout from '@/components/legal/PublicInfoLayout';
import { Button } from '@/components/ui/button';
import { useSiteConfig } from '@/site/SiteProvider';

const SupportPage = () => {
  const site = useSiteConfig();

  return (
    <PublicInfoLayout title="الدعم والمساعدة">
      <p className="text-muted-foreground">للمساعدة في الدخول أو البيانات أو طلبات الخصوصية، تواصل مع إدارة المجمع المسجل فيه أولاً؛ فهي الجهة التي تدير حسابك وبياناتك.</p>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <h2 className="mb-2 text-lg font-black">قبل التواصل</h2>
        <p className="text-muted-foreground">جهّز رقم المجمع واسم المستخدم ووصفاً واضحاً للمشكلة. لا ترسل رقم الدخول أو أي رمز سري في رسالة عامة.</p>
      </div>
      {site.whatsappUrl ? (
        <Button asChild className="min-h-11 gap-2 rounded-xl">
          <a href={site.whatsappUrl} target="_blank" rel="noreferrer">
            التواصل مع الدعم <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      ) : null}
    </PublicInfoLayout>
  );
};

export default SupportPage;
