import React, { useEffect, useState } from 'react';
import {
  LockKeyhole,
  Menu,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { resolveAssetUrl } from '@/lib/assetUrl';
import { useSiteConfig } from '@/site/SiteProvider';

const DashboardSidebarContent = ({
  title,
  sections,
  activeSection,
  mobile = false,
  onClose,
  onChooseSection,
  onLogout,
}) => {
  const site = useSiteConfig();
  // The navigation is always dark, so the white Nukhab mark keeps its contrast.
  const sidebarLogo = resolveAssetUrl(site.whiteLogo || site.logo);
  const activeParentKey = sections.find((section) => (
    section.children?.some((child) => child.key === activeSection)
  ))?.key;
  const [expandedKey, setExpandedKey] = useState(activeParentKey || '');

  useEffect(() => {
    if (activeParentKey) setExpandedKey(activeParentKey);
  }, [activeParentKey]);

  return (
  <div className="flex h-full flex-col bg-[var(--brand-navigation)] text-white">
    <div className="relative flex h-[88px] shrink-0 items-center border-b border-white/[0.06] px-4">
      <div
        className="absolute right-4 h-[4.25rem] w-[4.6rem] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navigation-accent)]"
      >
        <img
          src={sidebarLogo}
          alt={`شعار ${title}`}
          decoding="sync"
          fetchpriority="high"
          className="h-full w-full object-contain"
        />
      </div>

      {mobile && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-3 h-11 w-11 text-white hover:bg-white/[0.12] hover:text-white"
          onClick={onClose}
          aria-label="إغلاق القائمة الجانبية"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}
    </div>

    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5 scrollbar-hide" aria-label="أقسام المنصة">
      {sections.map((section) => {
        const Icon = section.icon;
        const hasChildren = Boolean(section.children?.length);
        const isExpanded = expandedKey === section.key;
        const isActive = activeSection === section.key || activeParentKey === section.key;
        const isDisabled = Boolean(section.disabled);
        return (
          <div key={section.key}>
            <button
              type="button"
              onClick={() => {
                if (isDisabled) return;
                if (hasChildren) {
                  setExpandedKey((current) => current === section.key ? '' : section.key);
                  return;
                }
                onChooseSection(section.key);
              }}
              disabled={isDisabled}
              aria-expanded={hasChildren ? isExpanded : undefined}
              title={isDisabled ? `${section.label} - قريبًا` : section.label}
              aria-label={isDisabled ? `${section.label} - قريبًا ومقفل` : section.label}
              className={`group relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-2xl px-3 text-right text-[13px] font-bold tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navigation-accent)] disabled:cursor-not-allowed disabled:opacity-55 ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'bg-transparent text-white hover:bg-white/[0.08]'
              }`}
            >
              <Icon className={`h-[19px] w-[19px] shrink-0 ${isActive ? 'text-white' : 'text-[var(--brand-navigation-accent)]'}`} />
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              {Number(section.badge || 0) > 0 && (
                <span className={`grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-[10px] font-black ${isActive ? 'bg-[var(--brand-navigation)] text-white' : 'bg-[var(--brand-navigation-highlight)] text-white'}`}>
                  {Number(section.badge).toLocaleString('ar-SA-u-nu-latn')}
                </span>
              )}
              {hasChildren && (
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              )}
              {isDisabled && (
                <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold text-white">
                  قريبًا
                  <LockKeyhole className="h-3 w-3" />
                </span>
              )}
            </button>
            {hasChildren && isExpanded && (
              <fieldset className="min-w-0 m-0 border-0 p-0 mt-1 space-y-1 pe-3"  aria-label={`أقسام ${section.label}`}>
                {section.children.map((child) => {
                  const childActive = activeSection === child.key;
                  const ChildIcon = child.icon;
                  return (
                    <button
                      key={child.key}
                      type="button"
                      onClick={() => onChooseSection(child.key)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navigation-accent)] ${
                        childActive ? 'bg-white/[0.12] text-white' : 'text-white/80 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {ChildIcon && <ChildIcon className={`h-[17px] w-[17px] shrink-0 ${childActive ? 'text-white' : 'text-[var(--brand-navigation-accent)]'}`} aria-hidden="true" />}
                      <span className="min-w-0 flex-1">{child.label}</span>
                    </button>
                  );
                })}
              </fieldset>
            )}
          </div>
        );
      })}
    </nav>

    <div className="border-t border-white/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onLogout}
          className="h-11 gap-2 px-3 text-white hover:bg-white/[0.12] hover:text-white"
          title="تسجيل الخروج"
        >
          <LogOut className="h-5 w-5" />
          تسجيل الخروج
        </Button>
        <ThemeToggle className="h-11 w-11 shrink-0 text-white hover:bg-white/[0.12] hover:text-white" />
      </div>
    </div>
  </div>
  );
};

export default DashboardSidebarContent;
