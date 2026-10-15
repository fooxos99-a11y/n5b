import { FormDialog } from './FormDialog';
import { ChoiceOptions } from './ChoiceOptions';

export type ChoiceOption = { value: string; label: string };
export function ChoiceDialog({ visible, title, options, value, onChoose, onClose }: {
  visible: boolean; title: string; options: readonly ChoiceOption[]; value?: string;
  onChoose: (value: string) => void; onClose: () => void;
}) {
  return <FormDialog visible={visible} title={title} onClose={onClose}>
    <ChoiceOptions title={title} options={options} value={value} onChoose={selection => { onChoose(selection); onClose(); }} />
  </FormDialog>;
}
