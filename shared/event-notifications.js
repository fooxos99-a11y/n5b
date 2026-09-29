export const eventNotificationDefinitions = [];
// Discard saved policies for retired events, including store orders.
export function normalizeEventNotifications() {
  return {};
}
export const formatEventNotification = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
