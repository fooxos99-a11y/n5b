import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto('http://127.0.0.1:3017/tests/fixtures/staff-attendance.html');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForTimeout(250);
    const box = await dialog.boundingBox();
    assert.ok(box.width <= 320 && box.height < 200, 'Attendance prompt stays compact');
    assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 1, 'Prompt is centered');
    const present = page.getByRole('button', { name: 'حاضر', exact: true });
    const cancel = page.getByRole('button', { name: 'إلغاء', exact: true });
    const presentBox = await present.boundingBox();
    const cancelBox = await cancel.boundingBox();
    assert.equal(presentBox.y, cancelBox.y, 'Actions share one row');
    assert.ok(presentBox.height >= 44 && cancelBox.height >= 44, 'Actions remain touch friendly');
    await present.click();
    await dialog.waitFor({ state: 'detached' });
    await page.reload();
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    await page.close();
  }
} finally {
  await browser.close();
}
