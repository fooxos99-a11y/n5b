import { createContext, useContext } from 'react';

export const DashboardLayoutContext = createContext(false);
export const useDashboardLayout = () => useContext(DashboardLayoutContext);
