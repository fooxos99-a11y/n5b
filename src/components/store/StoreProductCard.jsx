import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import PointsValue from '@/components/points/PointsValue';
import StoreProductImage from '@/components/store/StoreProductImage';

const StoreProductCard = ({ product, children, inactive = false, showUnlimitedStock = false, className }) => {
  const hasLimitedStock = product.stock !== null;

  return (
    <Card
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-3xl border-[#dfa33b]/25 bg-card shadow-[0_14px_36px_hsl(195_100%_10%/0.10)] transition-[transform,box-shadow,border-color,opacity] duration-200 hover:-translate-y-1 hover:border-[#dfa33b]/55 hover:shadow-[0_20px_44px_hsl(195_100%_10%/0.16)]',
        inactive && 'opacity-60 grayscale-[0.25]',
        className,
      )}
    >
      <div className="relative overflow-hidden bg-gradient-to-br from-[#f8efd9] via-[#fffaf0] to-[#e7f1f3] dark:from-[#124844] dark:via-[#0b3a36] dark:to-[#072a27]">
        <StoreProductImage
          src={product.imageData}
          alt={product.name}
          className="bg-transparent p-3 transition-transform duration-300 group-hover:scale-[1.035] sm:p-4"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06332f]/35 to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-full border border-[#f0bd55]/45 bg-[#06332f]/90 px-2.5 py-1 shadow-lg backdrop-blur-sm">
          <PointsValue value={product.pointsPrice} className="text-base text-[#f0bd55]" iconClassName="h-5 w-5" />
        </span>
        {(hasLimitedStock || showUnlimitedStock) && (
          <span className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-black text-[#06332f] shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-[#06332f]/90 dark:text-white">
            {hasLimitedStock ? `المتبقي ${Number(product.stock || 0).toLocaleString('ar-SA-u-nu-latn')}` : 'مخزون غير محدود'}
          </span>
        )}
      </div>

      <CardContent className="flex min-h-[8.5rem] flex-1 flex-col gap-3 p-3.5 sm:p-4">
        <h3 className="line-clamp-2 h-10 shrink-0 sm:h-12 text-sm font-black leading-5 text-foreground sm:text-base sm:leading-6">
          {product.name}
        </h3>
        <div className="mt-auto">{children}</div>
      </CardContent>
    </Card>
  );
};

export default StoreProductCard;

