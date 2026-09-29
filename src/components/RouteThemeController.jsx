import { useLayoutEffect } from 'react';
import { useLocation } from '@/lib/router';
import { applyTheme, getPreferredThemeForPath } from '@/lib/theme';

const RouteThemeController = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    applyTheme(getPreferredThemeForPath(pathname));
  }, [pathname]);

  return null;
};

export default RouteThemeController;
