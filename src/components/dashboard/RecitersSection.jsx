import React from 'react';
import CommitteeStaffSection from '@/components/dashboard/CommitteeStaffSection';
import { studentsApi } from '@/services/studentsApi';
import { RECITER_BASE_PERMISSIONS } from '../../../shared/dashboard-permissions.js';

export default function RecitersSection() {
  return <CommitteeStaffSection
    editablePermissions
    fixedPermissions={RECITER_BASE_PERMISSIONS}
    singularLabel="المقرئ"
    pluralLabel="المقرئون"
    loadStaff={studentsApi.getReciters}
    createStaff={studentsApi.createReciter}
    updateStaff={studentsApi.updateReciter}
    deleteStaff={studentsApi.deleteReciter}
    setStaffActive={studentsApi.setReciterActive}
  />;
}
