import React from 'react';
import { Bell } from 'lucide-react';
import MessageRecipientsList from '@/components/dashboard/MessageRecipientsList';
import { notificationRoleLabels } from '../../../shared/notification-roles.js';

export const recipientRoleLabels = notificationRoleLabels;
export const isNotificationRecipientSelected = (person, selection) => selection.roles.includes(person.role)
  || (person.role === 'student' && selection.committeeIds.includes(String(person.committeeId)))
  || selection.people.includes(`${person.role}:${person.id}`);

export default function NotificationRecipients({ people, value, onChange, count }) {
  const keys = people.map((person) => `${person.role}:${person.id}`);
  const allSelected = keys.length > 0 && people.every((person) => isNotificationRecipientSelected(person, value));
  const updatePeople = (next) => onChange({ roles: [], committeeIds: [], people: next });
  const toggleAll = () => updatePeople(allSelected ? value.people.filter((key) => !keys.includes(key)) : [...new Set([...value.people, ...keys])]);
  const toggle = (person) => {
    const key = `${person.role}:${person.id}`;
    updatePeople(value.people.includes(key) ? value.people.filter((item) => item !== key) : [...value.people, key]);
  };
  return <MessageRecipientsList recipients={people} selectedCount={count} allSelected={allSelected} onToggleAll={toggleAll} onToggle={toggle} isSelected={(person) => isNotificationRecipientSelected(person, value)} getKey={(person) => `${person.role}:${person.id}`} renderBadge={(person) => <><Bell className="h-5 w-5" /><span>{recipientRoleLabels[person.role]}</span></>} />;
}
