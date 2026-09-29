import React from 'react';
import {
  Pencil,
  Power,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const statusLabels = {
  active: 'مفعّل',
  inactive: 'متوقف',
  pending: 'قيد التجهيز',
};

const statusClasses = {
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  inactive: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300',
  pending: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
};

const OwnerComplexCard = ({
  complex,
  busy,
  onEdit,
  onToggleStatus,
  onOpen,
}) => {
  const isActive = complex.status === 'active';

  return (
    <Card className="rounded-2xl border-border/70 bg-card shadow-sm transition-colors hover:border-primary/25">
      <CardContent className="flex flex-col gap-3 p-3 [font-family:var(--font-ui)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
            <h3 className="truncate text-base font-black text-foreground sm:text-lg">{complex.name}</h3>
            <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${statusClasses[complex.status] || statusClasses.pending}`}>
              {statusLabels[complex.status] || statusLabels.pending}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            رقم المجمع: {complex.registrationNumber || '-'}
            {complex.managerName ? ` · المدير: ${complex.managerName}` : ''}
          </p>
          {complex.provisioningError ? (
            <output className="mt-2 flex items-start gap-1.5 text-xs font-bold leading-5 text-red-600" >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              تعذر تجهيز قاعدة بيانات المجمع.
            </output>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
          <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => onOpen(complex.id)}>
            <Eye className="h-4 w-4" />
            تفاصيل
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => onEdit(complex)}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`h-11 gap-2 rounded-xl ${isActive ? 'border-red-500/25 text-red-600 hover:bg-red-500/10 hover:text-red-600' : 'border-emerald-500/25 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
            loading={busy === `status-${complex.id}`}
            onClick={() => onToggleStatus(complex)}
          >
            {busy !== `status-${complex.id}` && <Power className="h-4 w-4" />}
            {isActive ? 'إيقاف' : 'تفعيل'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default OwnerComplexCard;
