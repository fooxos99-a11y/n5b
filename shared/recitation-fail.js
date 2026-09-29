export const RECITATION_FAILED_LABEL = 'راسب';

export const canMarkRecitationFailed = (task) => ['memorization', 'review', 'link'].includes(task?.taskType);
