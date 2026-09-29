import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StudentHomeStatus({ message, onRetry }) {
  return <output className="student-home-status" ><span>{message}</span><Button variant="ghost" onClick={onRetry}><RotateCcw size={15} />إعادة المحاولة</Button></output>;
}
