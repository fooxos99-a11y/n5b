import React from 'react';
import ListeningChoice from '@/components/portal/ListeningChoice';

const RepeatCountSelector = ({ value = 1, editable = false, onChange, ariaLabel = 'هل كرر الطالب؟', label = 'التكرار', compact = false }) => (
  <ListeningChoice value={value} onChange={onChange} disabled={!editable}
    ariaLabel={ariaLabel} label={label} compact={compact} />
);

export default RepeatCountSelector;
