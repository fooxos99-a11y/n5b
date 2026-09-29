import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const MOBILE_HEADER_ACTIONS_ID = 'dashboard-mobile-header-actions';

const DashboardMobileHeaderActions = ({ children }) => {
  const [container, setContainer] = useState(null);

  useEffect(() => {
    setContainer(document.getElementById(MOBILE_HEADER_ACTIONS_ID));
  }, []);

  return container ? createPortal(children, container) : null;
};

export { MOBILE_HEADER_ACTIONS_ID };
export default DashboardMobileHeaderActions;
