import React, { useId } from 'react';
import { resolveAssetUrl } from '@/lib/assetUrl';
import './startup.css';

export function StartupSplash({ site, hold = false }) {
  const patternId = useId();
  return <div className="startup-splash" data-hold={hold || undefined} style={{ '--startup-background': site.themeColor, '--startup-accent': site.navigation.accent }} aria-hidden="true">
    <div className="startup-brand">
      <img className="startup-brand-logo" src={resolveAssetUrl(site.whiteLogo || site.logo)} alt="" fetchPriority="high" />
      <p>برنامج نخب التعليمي</p>
    </div>
    <svg className="startup-pattern" width="100%" height="192" aria-hidden="true">
      <defs><pattern id={patternId} width="96" height="96" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M48 0 96 48 48 96 0 48Z" />
          {[0, 90, 180, 270].map(angle => <path key={angle} transform={`rotate(${angle} 48 48)`} d="M48 48C22 48 16 28 16 16C28 16 48 22 48 48Z" />)}
        </g>
      </pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  </div>;
}
