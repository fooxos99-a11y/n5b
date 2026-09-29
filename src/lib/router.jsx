import React, { forwardRef, useCallback, useMemo } from 'react';
import {
  Link as WouterLink,
  Router,
  useLocation as useWouterLocation,
  useSearch,
} from 'wouter';

export const BrowserRouter = ({ basename, children }) => (
  <Router base={basename || ''}>{children}</Router>
);

export const Link = forwardRef(({ to, ...props }, ref) => (
  <WouterLink ref={ref} href={to} {...props} />
));
Link.displayName = 'Link';

export const useNavigate = () => {
  const [, navigate] = useWouterLocation();
  return useCallback(
    (to, options = {}) => navigate(to, { replace: Boolean(options.replace) }),
    [navigate],
  );
};

export const useLocation = () => {
  const [pathname] = useWouterLocation();
  return useMemo(
    () => ({ pathname, search: window.location.search, hash: window.location.hash }),
    [pathname],
  );
};

export const useSearchParams = () => {
  const search = useSearch();
  return useMemo(() => [new URLSearchParams(search)], [search]);
};

export { useParams } from 'wouter';
