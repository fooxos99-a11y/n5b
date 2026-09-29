import React from 'react';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';

const StoreProductImage = ({ src, alt, className }) => (
  <div className={cn('relative aspect-square w-full shrink-0 overflow-hidden bg-background p-2', className)}>
    {src ? <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 block h-full w-full select-none object-contain p-3" />
      : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/5 via-background to-amber-100/30" data-product-placeholder aria-hidden="true">
        <div className="absolute h-3/4 w-3/4 rounded-full border border-primary/10" />
        <div className="grid h-20 w-20 place-items-center rounded-3xl border border-primary/10 bg-background/80 text-primary shadow-sm"><Gift className="h-10 w-10" strokeWidth={1.3} /></div>
      </div>}
  </div>
);

export default StoreProductImage;
