import React from 'react';
import DatePicker from '@/components/ui/date-picker';
import { studentsApi } from '@/services/studentsApi';

const loadRecitationDates = ({ from, to }) => (
  studentsApi.getRecitationSessionDates({ from, to }).then((result) => result.dates || [])
);

const RecitationSessionDatePicker = ({
  value,
  onChange,
  min,
  max,
  className,
  ariaLabel = 'تاريخ جلسة التسميع',
}) => {
  return (
    <DatePicker
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      className={className}
      ariaLabel={ariaLabel}
      loadAvailableDates={loadRecitationDates}
      unavailableNote="الأيام المعطلة ليست جلسات تسميع فعلية."
    />
  );
};

export default RecitationSessionDatePicker;
