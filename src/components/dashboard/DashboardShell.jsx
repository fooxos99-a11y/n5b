import './dashboard-header-filters.css';
import PageLoadingBoundary from '@/components/ui/page-loading-boundary';
import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import CustomCursor from '@/components/CustomCursor';
import DashboardSidebarContent from '@/components/dashboard/DashboardSidebarContent';
import { DASHBOARD_HEADER_CONTENT_ID } from '@/components/dashboard/DashboardHeaderContent';
import { MOBILE_HEADER_ACTIONS_ID } from '@/components/dashboard/DashboardMobileHeaderActions';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { useSiteConfig } from '@/site/SiteProvider';

const DashboardShell = ({
  title,
  sections = [],
  activeSection = '',
  contentKey = activeSection,
  onSectionChange,
  onLogout,
  children,
  persistentContent = null,
  headerContent = null,
  showSectionTitle = true,
  replaceHeaderTitle = false,
  maxWidthClass = 'max-w-[1480px]',
}) => {
  const site = useSiteConfig();
  const dashboardTitle = title || site.name;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  const activeItem = useMemo(
    () => sections.flatMap((section) => [section, ...(section.children || [])])
      .find((section) => section.key === activeSection),
    [activeSection, sections],
  );

  const chooseSection = (key) => {
    onSectionChange?.(key);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-[100dvh] bg-[#fafbfc] dark:bg-background text-foreground [font-family:var(--font-ui)]" dir="rtl">
      <CustomCursor />
      <Helmet><title>{dashboardTitle}</title></Helmet>

      <aside
        className="fixed bottom-0 right-0 top-0 z-50 hidden w-[276px] overflow-hidden border-l border-white/[0.06] shadow-[0_0_35px_rgba(7,28,43,.18)] lg:block"
      >
        <DashboardSidebarContent
          title={dashboardTitle}
          sections={sections}
          activeSection={activeSection}
          onClose={() => setSidebarOpen(false)}
          onChooseSection={chooseSection}
          onLogout={onLogout}
        />
      </aside>

      <header
        className="dashboard-header fixed left-0 right-0 top-0 z-40 flex h-[68px] items-center gap-3 border-b border-border/90 bg-card/95 px-3 backdrop-blur-xl sm:px-5 lg:right-[276px] lg:h-[84px] lg:px-8"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="h-11 w-11 shrink-0 bg-card lg:hidden"
          aria-label="فتح القائمة الجانبية"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {replaceHeaderTitle ? <div key="page-header-content" id={DASHBOARD_HEADER_CONTENT_ID} className="min-w-0 flex-1" /> : <div key="page-header-title" className="min-w-0">
          {showSectionTitle && <h1 className="truncate text-base font-black text-foreground sm:text-lg">{activeItem?.label || 'لوحة التحكم'}</h1>}
        </div>}
        <div className="ms-auto flex min-w-0 items-center gap-2">
          <div id={MOBILE_HEADER_ACTIONS_ID} className="min-w-0" />
          {headerContent && <div className="min-w-0">{headerContent}</div>}
        </div>
        <div id="dashboard-header-filters" className="min-w-0 empty:hidden" />
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-[#071c2b]/55 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed bottom-0 right-0 top-0 z-[80] w-[min(88vw,320px)] overflow-hidden shadow-[0_0_48px_rgba(7,28,43,.34)] lg:hidden"
              initial={{ x: 340 }}
              animate={{ x: 0 }}
              exit={{ x: 340 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <DashboardSidebarContent
                title={dashboardTitle}
                sections={sections}
                activeSection={activeSection}
                mobile
                onClose={() => setSidebarOpen(false)}
                onChooseSection={chooseSection}
                onLogout={onLogout}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main
        className="dashboard-main min-h-[100dvh] min-w-0 px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[84px] sm:px-5 sm:pt-[92px] lg:px-8 lg:pb-8 lg:pr-[308px] lg:pt-[114px]"
      >
        <div className={`mx-auto w-full ${maxWidthClass}`}>
          {persistentContent}
          <PageLoadingBoundary key={contentKey} scope="dashboard" initialScreen={!entered} onReady={() => setEntered(true)}>
              {children}
          </PageLoadingBoundary>
        </div>
      </main>

      <Toaster />
    </div>
  );
};

export default DashboardShell;
