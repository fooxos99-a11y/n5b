import {
	Toast,
	ToastClose,
	ToastDescription,
	ToastProvider,
	ToastTitle,
	ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { createPortal } from 'react-dom';
import React from 'react';

export function Toaster() {
	const { toasts } = useToast();
	const viewport = typeof document === 'undefined'
		? null
		: createPortal(<ToastViewport />, document.body);

	return (
		<ToastProvider duration={2000}>
			{toasts.map(({ id, title, description, action, ...props }) => {
				return (
					<Toast key={id} {...props}>
						<div className="grid gap-1">
							{title && <ToastTitle>{title}</ToastTitle>}
							{description && (
								<ToastDescription>{description}</ToastDescription>
							)}
						</div>
						{action}
						<ToastClose />
					</Toast>
				);
			})}
			{viewport}
		</ToastProvider>
	);
}
