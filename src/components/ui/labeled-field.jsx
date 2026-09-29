import React, { Children, cloneElement, isValidElement, useId } from 'react';
import { Label } from '@/components/ui/label';

const LabeledField = ({ label, children, className = 'space-y-1.5' }) => {
  const generatedId = useId();
  const child = Children.only(children);
  const controlId = isValidElement(child) && child.props.id ? child.props.id : generatedId;

  return (
    <div className={className}>
      <Label htmlFor={controlId}>{label}</Label>
      {isValidElement(child) ? cloneElement(child, { id: controlId }) : child}
    </div>
  );
};

export default LabeledField;
