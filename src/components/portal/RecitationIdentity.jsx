import React from 'react';
import { User } from 'lucide-react';

export default function RecitationIdentity({ name, nameAction = null, children }) {
  const Icon = User;
  return (
    <div className="recitation-identity">
      <div className="recitation-person"><span className="recitation-avatar"><Icon aria-hidden="true" /></span><span className="recitation-name">{name}</span>{nameAction}</div>
      {children}
    </div>
  );
}
