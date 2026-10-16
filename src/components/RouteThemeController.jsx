import { useLayoutEffect } from 'react';
import { useLocation, useSearchParams } from '@/lib/router';
import { applyTheme, getPreferredThemeForPath } from '@/lib/theme';

const RouteThemeController = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();

  useLayoutEffect(() => {
    applyTheme(getPreferredThemeForPath(pathname, undefined, search));
  }, [pathname, search]);

  return null;
};

export default RouteThemeController;
