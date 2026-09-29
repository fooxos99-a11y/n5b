import React from 'react';

/** Shared responsive settings section container. */
const SettingsGroup = ({ children }) => (
  <section className="space-y-4 p-4 sm:p-6">
    {children}
  </section>
);

export default SettingsGroup;
