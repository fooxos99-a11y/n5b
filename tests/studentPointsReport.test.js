import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('student points report is shown only for enabled teacher adjustments', async () => {
  const [reports, dashboard, api, server, administrators, popover] = await Promise.all([
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/AdministratorsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/popover.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(reports, /if \(canViewTeacherPoints\) loadList\('teacherPoints', listLoaders\.teacherPoints\)/);
  assert.match(reports, /showTeacherPoints: canViewTeacherPoints && !archiveId/);
  assert.match(dashboard, /canViewTeacherPoints=\{settings\.teacherManualPointsEnabled\}/);
  assert.match(api, /\/reports\/student-points/);
  assert.match(server, /app\.get\('\/api\/reports\/student-points'/);
  assert.doesNotMatch(server, /pointsSystemEnabled\)/);
  assert.match(server, /WHERE s\.committee_id = \?/);
  assert.match(server, /app\.get\('\/api\/reports\/teacher-points'/);
  assert.match(server, /t\.source_type IN \('supervisor_award', 'supervisor_deduction'\)/);
  assert.match(administrators, /<PopoverContent[\s\S]*z-\[160\]/);
  assert.match(administrators, /flex min-w-0 flex-1 flex-wrap/);
  assert.doesNotMatch(administrators, /option\.description/);
  assert.match(administrators, /whitespace-normal break-words/);
  assert.match(administrators, /useMediaQuery\('\(max-width: 639px\)'\)/);
  assert.match(administrators, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(administrators, /overflow-y-auto overscroll-contain touch-pan-y \[-webkit-overflow-scrolling:touch\]/);
  assert.match(popover, /PopoverPrimitive\.Portal/);
});
