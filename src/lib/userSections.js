export const userSectionKeys = ['students', 'supervisors', 'administrators'];

// Group only sections that have already passed permission, feature and offline checks.
export function groupUserSections(sections) {
  const tabs = sections.filter(({ key }) => userSectionKeys.includes(key));
  if (!tabs.length) return sections;
  const first = tabs[0].key;
  return sections.flatMap((section) => {
    if (section.key === first) return [{ ...section, key: 'users', label: 'المستخدمون', userTabs: tabs }];
    return userSectionKeys.includes(section.key) ? [] : [section];
  });
}
