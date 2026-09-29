import { useEffect, useState } from 'react';
import { useIsPresent } from 'framer-motion';
import { createPortal } from 'react-dom';

export const DASHBOARD_HEADER_CONTENT_ID = 'dashboard-header-content';

export default function DashboardHeaderContent({ children }) {
  const isPresent = useIsPresent();
  const [container, setContainer] = useState(null);
  useEffect(() => { setContainer(document.getElementById(DASHBOARD_HEADER_CONTENT_ID)); }, []);
  return isPresent && container ? createPortal(children, container) : null;
}
