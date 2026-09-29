import React from 'react';
import PublicInfoLayout from '@/components/legal/PublicInfoLayout';
import { useSiteConfig } from '@/site/SiteProvider';
import { termsContent } from '../../shared/legal-content.js';
export default function TermsOfUse() {
  const site = useSiteConfig();
  return <PublicInfoLayout title={termsContent.title} showSiteName={false}>
    <p className="text-muted-foreground">آخر تحديث: {termsContent.updated}</p>
    {termsContent.sections.map(section => <section key={section.title} className="space-y-2">
      <h2 className="text-lg font-black text-foreground">{section.title}</h2>
      <div className="text-muted-foreground"><p>{section.body.replace('{siteName}', site.name)}</p></div>
    </section>)}
  </PublicInfoLayout>;
}
