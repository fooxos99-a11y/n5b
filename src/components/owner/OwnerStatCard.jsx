import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const OwnerStatCard = ({ icon: Icon, label, value, tone = 'text-primary' }) => (
  <Card className="border-border/70 bg-card shadow-sm">
    <CardContent className="flex min-h-24 items-center gap-3 p-3 sm:p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-black text-foreground sm:text-2xl">{value}</span>
        <span className="block text-xs font-bold text-muted-foreground sm:text-sm">{label}</span>
      </span>
    </CardContent>
  </Card>
);

export default OwnerStatCard;
