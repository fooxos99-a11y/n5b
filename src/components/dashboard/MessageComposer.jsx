import React from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function MessageComposer({ value, onChange, onSend, disabled, sending, placeholder, maxLength, actions, children }) {
  return <div className="space-y-2 [font-family:var(--font-ui)]">
    <Label>نص الرسالة</Label>
    <Textarea aria-label="نص الرسالة" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={sending} className="min-h-32 bg-transparent border-border text-foreground" />
    <div className="flex flex-wrap items-center gap-3">
      {actions}
      <Button type="button" onClick={onSend} disabled={disabled || sending} className="ms-auto min-h-11 gap-2" aria-busy={sending}>
        <Send className="h-4 w-4" />إرسال
      </Button>
    </div>
    {children}
  </div>;
}
