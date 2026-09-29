import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PageBackButton = ({ onClick, label = 'الرجوع', iconOnly = false, className = '' }) => (
  <Button
    type="button"
    variant="outline"
    onClick={onClick}
    className={`h-11 rounded-2xl border-primary/25 bg-card/90 font-bold text-primary shadow-lg shadow-primary/10 backdrop-blur-xl hover:bg-primary/10 hover:text-primary ${iconOnly ? 'w-11 p-0' : 'gap-2 px-4'} ${className}`}
    aria-label={label}
  >
    <ArrowRight className="h-5 w-5" />
    {!iconOnly && <span>{label}</span>}
  </Button>
);

export default PageBackButton;
