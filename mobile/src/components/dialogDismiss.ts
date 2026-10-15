export type DialogDismissOptions = { visible: boolean; rendered: boolean; busy: boolean; onClose: () => void };

// Native Modal owns hardware-back dismissal through onRequestClose.
export function useDialogDismiss(_options: DialogDismissOptions) { return; }
