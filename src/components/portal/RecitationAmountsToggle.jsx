import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const RecitationAmountsToggle = ({ visible, onToggle, compact = false }) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={`${compact ? 'h-10 w-10 min-h-10' : 'h-11 w-11 sm:h-10 sm:w-10 sm:min-h-10'} shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary`}
    onClick={onToggle}
    aria-label={visible ? 'إخفاء جميع المقادير' : 'إظهار جميع المقادير'}
    title={visible ? 'إخفاء جميع المقادير' : 'إظهار جميع المقادير'}
  >
    {visible ? <Eye className={compact ? 'h-4 w-4' : 'h-5 w-5'} /> : <EyeOff className={compact ? 'h-4 w-4' : 'h-5 w-5'} />}
  </Button>
);

export default RecitationAmountsToggle;
