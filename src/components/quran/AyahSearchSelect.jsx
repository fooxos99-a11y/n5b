import React, { useMemo } from 'react';
import SearchableQuranSelect from '@/components/quran/SearchableQuranSelect';

const AyahSearchSelect = ({ value, ayahs, onChange }) => {
  const options = useMemo(() => ayahs.map((ayah) => ({
    value: String(ayah.ayah),
    label: String(ayah.ayah),
  })), [ayahs]);

  return (
    <SearchableQuranSelect
      value={value}
      options={options}
      placeholder="الآية"
      title="اختر الآية"
      searchPlaceholder="اكتب رقم الآية"
      searchLabel="البحث في الآيات"
      searchInputMode="numeric"
      onChange={onChange}
    />
  );
};

export default AyahSearchSelect;
