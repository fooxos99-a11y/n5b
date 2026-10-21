import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

const normalizeMapText = (value, maxLength) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const SummitMapTextInput = ({ value, onCommit, maxLength = 180, ...props }) => {
  const [draft, setDraft] = useState(String(value || ''));

  useEffect(() => {
    setDraft(String(value || ''));
  }, [value]);

  const commit = () => {
    const normalized = normalizeMapText(draft, maxLength);
    setDraft(normalized);
    if (normalized !== String(value || '')) onCommit?.(normalized);
  };

  return (
    <Input
      {...props}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
};

export default SummitMapTextInput;
