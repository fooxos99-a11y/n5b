import React from 'react';
import { ChevronDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function TeacherStudentHistoryCard({ student, expanded, onToggle, children }) {
  const contentId = `student-history-${student.id}`;
  return <Card className="overflow-hidden rounded-2xl border-border bg-card [font-family:var(--font-ui)]" data-student-history-card>
    <Button variant="ghost" onClick={onToggle} aria-expanded={expanded} aria-controls={expanded ? contentId : undefined} className="h-auto min-h-20 w-full justify-start gap-3 whitespace-normal rounded-none p-4 text-right">
      <User className="h-10 w-10 shrink-0 rounded-xl bg-primary/5 p-2 text-primary" />
      <span className="min-w-0 flex-1 break-words text-sm font-bold">{student.name}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </Button>
    {expanded && <div id={contentId} className="space-y-3 border-t border-border/60 bg-muted/20 p-3">{children}</div>}
  </Card>;
}
