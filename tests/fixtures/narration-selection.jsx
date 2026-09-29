import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CommitteeMultiSelect from '../../src/components/dashboard/CommitteeMultiSelect';
import { Dialog, DialogContent, DialogTitle } from '../../src/components/ui/dialog';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';
import NarrationJuzParts from '../../src/components/dashboard/NarrationJuzParts';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');

function Fixture() {
  const [value, setValue] = useState(['all']);
  return <Dialog open><DialogContent dir="rtl"><DialogTitle>اختيار حلقات السرد</DialogTitle>
    <CommitteeMultiSelect value={value} onChange={setValue} committees={Array.from({ length: 20 }, (_, index) => ({ id: index + 1, name: `حلقة ${index + 1}` }))} />
    <output aria-label="القيمة المختارة">{value.join(',')}</output>
    <Button>خارج القائمة</Button>
    <NarrationJuzParts archived groups={[{ juzNumber: 30, parts: [
      { id: 1, juzNumber: 30, startSurahName: 'النبأ', startAyah: 1, endSurahName: 'النبأ', endAyah: 20, score: null },
      { id: 2, juzNumber: 30, startSurahName: 'الإخلاص', startAyah: 1, endSurahName: 'الناس', endAyah: 6, score: 90 },
    ] }]} />
  </DialogContent></Dialog>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
