import React from 'react';

export default function ProgressValue({ value, label }) {
  return <progress className="sr-only" max={100} value={value} aria-label={label} aria-valuenow={value} aria-valuetext={`${value}%`} />;
}
