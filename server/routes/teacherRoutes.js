import { createCommitteeStaffRouter } from './committeeStaffRoutes.js';

export const createTeacherRouter = dependencies => createCommitteeStaffRouter(dependencies, {
  role: 'teacher', label: 'المعلم', permission: 'teachers', singleCommittee: true,
});
