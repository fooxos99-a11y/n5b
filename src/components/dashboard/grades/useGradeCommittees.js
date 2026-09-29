import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import CommitteeFilter from './CommitteeFilter';
import { ALL_COMMITTEES } from './gradesFormat';

/**
 * Circles the account may grade and the circle filter element.
 */
export default function useGradeCommittees() {
  const { toast } = useToast();
  const [committeeId, setCommitteeId] = useState(ALL_COMMITTEES);
  const [committees, setCommittees] = useState([]);

  useEffect(() => {
    let active = true;
    studentsApi.getCommittees()
      .then((rows) => { if (active) setCommittees(Array.isArray(rows) ? rows : []); })
      .catch((error) => {
        if (active) toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
      });
    return () => { active = false; };
  }, [toast]);

  const showFilter = committees.length > 0;
  const filter = showFilter
    ? React.createElement(CommitteeFilter, { committees, value: committeeId, onChange: setCommitteeId })
    : null;
  return { committeeId, filter };
}
