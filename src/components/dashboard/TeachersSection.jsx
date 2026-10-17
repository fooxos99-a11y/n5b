import React from 'react';
import CommitteeStaffSection from '@/components/dashboard/CommitteeStaffSection';
import { studentsApi } from '@/services/studentsApi';

export default function TeachersSection() {
  return <CommitteeStaffSection
    singleCommittee
    singularLabel="المعلم"
    pluralLabel="المعلمون"
    loadStaff={studentsApi.getTeachers}
    createStaff={studentsApi.createTeacher}
    updateStaff={studentsApi.updateTeacher}
    deleteStaff={studentsApi.deleteTeacher}
    setStaffActive={studentsApi.setTeacherActive}
  />;
}
