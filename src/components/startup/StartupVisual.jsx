import React from 'react';
import './startup.css';

export function StartupLines() {
  return <svg className="startup-lines" viewBox="0 0 800 800" aria-hidden="true">
    {[0, 60, 120, 180, 240, 300].map(angle => <path key={angle} transform={`rotate(${angle} 400 400)`} d="M 0 180 L 180 180 L 340 365" />)}
  </svg>;
}
