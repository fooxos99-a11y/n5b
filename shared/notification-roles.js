export const notificationRoleLabels = Object.freeze({
  student: 'الطلاب',
  supervisor: 'المعلمون',
  admin: 'الإداريون',
  manager: 'مديرو المجمع',
});

export const notificationRoles = Object.freeze(Object.keys(notificationRoleLabels));
export const notificationStaffRoles = Object.freeze(notificationRoles.filter((role) => role !== 'student'));
