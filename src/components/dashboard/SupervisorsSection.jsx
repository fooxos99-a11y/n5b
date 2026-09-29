import React from 'react';
import CommitteeStaffSection from '@/components/dashboard/CommitteeStaffSection';
import { studentsApi } from '@/services/studentsApi';

const SupervisorsSection = () => (
  <CommitteeStaffSection
    singularLabel="المعلم"
    pluralLabel="معلمون"
    loadStaff={studentsApi.getSupervisors}
    createStaff={studentsApi.createSupervisor}
    updateStaff={studentsApi.updateSupervisor}
    deleteStaff={studentsApi.deleteSupervisor}
  />
);

export default SupervisorsSection;
