import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link } from '@/lib/router';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useSiteConfig } from '@/site/SiteProvider';

const PublicInfoLayout = ({ title, children, showSiteName = true }) => {
  const site = useSiteConfig();

  return (
    <div className="min-h-[100svh] bg-background px-3 py-5 text-foreground sm:px-5" dir="rtl">
      <Helmet><title>{title} | {site.name}</title></Helmet>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="outline" className="min-h-11 gap-2 rounded-xl">
            <Link to="/"><ArrowRight className="h-4 w-4" /> العودة</Link>
          </Button>
          <ThemeToggle />
        </div>
        <Card className="border-primary/25 bg-card shadow-xl shadow-primary/5">
          <CardHeader className="border-b border-primary/15 p-5">
            <h1 className="text-2xl font-black text-primary">{title}</h1>
            {showSiteName && <p className="text-sm font-bold text-muted-foreground">{site.name}</p>}
          </CardHeader>
          <CardContent className="space-y-6 p-5 text-sm font-semibold leading-8 sm:p-7">
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicInfoLayout;
