import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsPresent } from 'framer-motion';

export default function DashboardHeaderFilters({ children, aboveTitle = false }) {
  const [target, setTarget] = useState(null);
  const present = useIsPresent();
  useEffect(() => { setTarget(document.getElementById('dashboard-header-filters')); }, []);
  if (!target || !present) return null;
  const content = aboveTitle ? <div data-filters-above-title>{children}</div> : children;
  return createPortal(content, target);
}
