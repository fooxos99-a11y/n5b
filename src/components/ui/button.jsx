import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import React from 'react';
import LoadingSpinner from '@/components/ui/loading-spinner';

const buttonVariants = cva(
	'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold ring-offset-background transition-[transform,box-shadow,background-color,border-color,color] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100',
	{
		variants: {
			variant: {
				purchase: 'bg-gradient-to-l from-[#d09225] to-[#edbd57] text-white [&_svg]:text-white shadow-[0_8px_20px_rgba(208,146,37,0.25)] hover:from-[#dba238] hover:to-[#f0c66b] disabled:from-[#d09225]/50 disabled:to-[#edbd57]/50 disabled:opacity-100 disabled:shadow-none disabled:text-white',
				gradient: 'bg-[linear-gradient(105deg,#08746b,#07a194)] text-white hover:brightness-105',
				default: 'bg-primary !text-white shadow-[0_6px_16px_hsl(var(--primary)/.2)] hover:bg-primary-dark hover:!text-white hover:shadow-[0_8px_20px_hsl(var(--primary)/.27)]',
				destructive:
          'bg-destructive text-destructive-foreground shadow-[0_6px_16px_hsl(var(--destructive)/0.16)] hover:bg-destructive/90',
				outline:
          'border border-border bg-card text-foreground shadow-[0_2px_8px_hsl(210_40%_20%/0.04)] hover:border-primary/35 hover:bg-primary/[0.05] hover:text-primary',
				secondary:
          'border border-border/80 bg-secondary text-secondary-foreground hover:bg-secondary/75',
				ghost: 'text-muted-foreground hover:bg-primary/[0.08] hover:text-primary',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-11 px-4 py-2',
				sm: 'h-11 min-h-11 rounded-lg px-3',
				lg: 'h-12 px-8',
				icon: 'h-11 w-11 min-w-11 px-0',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
	const Comp = asChild ? Slot : 'button';
	if (asChild) {
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			>
				{children}
			</Comp>
		);
	}
	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			ref={ref}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...props}
		>
			{loading && <LoadingSpinner className="ml-2" />}
			{children}
		</Comp>
	);
});
Button.displayName = 'Button';

export { Button, buttonVariants };
