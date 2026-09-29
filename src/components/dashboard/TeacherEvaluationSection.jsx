import React from 'react';
import TeacherEvaluationDialog from '@/components/portal/TeacherEvaluationDialog';

const TeacherEvaluationSection = () => {
  const supervisorId = localStorage.getItem('wajeh_supervisor_id') || '';

  return <TeacherEvaluationDialog supervisorId={supervisorId} inline />;
};

export default TeacherEvaluationSection;
