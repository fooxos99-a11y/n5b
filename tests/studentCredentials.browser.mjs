import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
const browser=await chromium.launch();
try {
 for(const width of [360,1440]) {
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  const writes=[];
  await page.route('**/api/**', async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()==='POST'){writes.push({path,body:request.postDataJSON()});return route.fulfill({status:201,json:{id:99}});}
   const json=path.endsWith('/committees')?[{id:1,name:'حلقة اختبار'}]:path.endsWith('/registration-requests')?{requests:[{id:1,name:'طالب اختبار',age:12,nationalId:'1234567890',memorization:{items:[]}}]}:[];
   return route.fulfill({json});
  });
  await page.goto('http://127.0.0.1:3000/tests/fixtures/student-credentials.html');
  await page.getByRole('button',{name:'إضافة طالب',exact:true}).click();
  await page.getByRole('button',{name:'حفظ',exact:true}).click();
  assert.equal(writes.length,0);
  await page.getByLabel('اسم الطالب',{exact:true}).fill('طالب اختبار');
  await page.getByLabel('رقم الدخول',{exact:true}).fill('12345');
  await page.getByLabel('كلمة المرور',{exact:true}).fill('12');
  await page.getByRole('combobox',{name:'حلقة الطالب',exact:true}).click();
  await page.getByRole('option',{name:'حلقة اختبار',exact:true}).click();
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
  await page.screenshot({path:`outputs/student-credentials-${width}.png`});
  await page.getByRole('button',{name:'حفظ',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(writes[0].body.password,'12');
  await page.goto('http://127.0.0.1:3000/tests/fixtures/student-credentials.html?registration');
  await page.getByRole('button',{name:'قبول نهائي لطلب طالب اختبار',exact:true}).click();
  assert.equal(await page.getByLabel('رقم الدخول',{exact:true}).inputValue(),'1234567890');
  assert.ok(await page.getByRole('button',{name:'قبول نهائي',exact:true}).isDisabled());
  await page.getByLabel('كلمة المرور',{exact:true}).fill('ab');
  await page.getByRole('combobox',{name:'الحلقة',exact:true}).click();
  await page.getByRole('option',{name:'حلقة اختبار',exact:true}).click();
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
  await page.screenshot({path:`outputs/accept-credentials-${width}.png`});
  await page.getByRole('button',{name:'قبول نهائي',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(writes[1].body.password,'ab');
  await page.close();
 }
 globalThis.console.log('PASS: student creation and acceptance credentials on mobile and desktop');
} finally {await browser.close();}
