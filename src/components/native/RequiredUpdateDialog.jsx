import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function RequiredUpdateDialog({ open, url, onUpdate }) {
  return <Dialog open={open}>
    <DialogContent dir="rtl" aria-describedby={undefined} className="[font-family:var(--font-ui)]" onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>يلزم تحديث التطبيق للمتابعة</DialogTitle>
      {url ? <Button asChild className="min-h-11"><a href={url} target="_blank" rel="noreferrer">تحديث الآن</a></Button>
        : <Button type="button" className="min-h-11" onClick={onUpdate}>تحديث الآن</Button>}
    </DialogContent>
  </Dialog>;
}
