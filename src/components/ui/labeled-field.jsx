import React, { Children, cloneElement, isValidElement, useId } from 'react';
import { Label } from '@/components/ui/label';

const LabeledField = ({ label, children, className = 'space-y-1.5', htmlFor, error }) => {
  const generatedId = useId();
  const child = Children.only(children);
  const controlId = htmlFor || (isValidElement(child) && child.props.id ? child.props.id : generatedId);

  return (
    <div className={className}>
      <Label htmlFor={controlId}>{label}</Label>
      {isValidElement(child) ? cloneElement(child, { id: controlId }) : child}
      {error && <p id={`${controlId}-error`} role="status" className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

export default LabeledField;
