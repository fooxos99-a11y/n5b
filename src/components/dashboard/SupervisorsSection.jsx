import React from 'react';
import CommitteeStaffSection from '@/components/dashboard/CommitteeStaffSection';
import { studentsApi } from '@/services/studentsApi';

const SupervisorsSection = () => (
  <CommitteeStaffSection
    editablePermissions
    singularLabel="مشرف المسار"
    pluralLabel="مشرفو المسارات"
    loadStaff={studentsApi.getSupervisors}
    createStaff={studentsApi.createSupervisor}
    updateStaff={studentsApi.updateSupervisor}
    deleteStaff={studentsApi.deleteSupervisor}
  />
);

export default SupervisorsSection;
