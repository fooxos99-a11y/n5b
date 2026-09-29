import React, { lazy, Suspense, useState } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementPanel, ManagementTabs } from '@/components/dashboard/layout/ManagementPanel';

const panels = {
  students: lazy(() => import('./StudentsSection')),
  supervisors: lazy(() => import('./SupervisorsSection')),
  administrators: lazy(() => import('./AdministratorsSection')),
};

/** One card: user groups as tabs, then each group's toolbar and list. */
export default function UsersSection({ tabs = [] }) {
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('tab'));
  const active = tabs.some(({ key }) => key === selected) ? selected : tabs[0]?.key;
  const Panel = panels[active];
  if (!Panel) return null;
  return (
    <ManagementPanel>
      <ManagementTabs
        label="فئات المستخدمين"
        items={tabs.map(({ key, label }) => ({ value: key, label }))}
        value={active}
        onChange={setSelected}
      >
        <Suspense fallback={<DashboardLoader />}><Panel key={active} /></Suspense>
      </ManagementTabs>
    </ManagementPanel>
  );
}
