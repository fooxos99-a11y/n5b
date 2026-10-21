import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium,webkit} from 'playwright';
import {Buffer} from 'node:buffer';

const output='outputs/startup-native-20261021';await mkdir(output,{recursive:true});
const server=await preview({configFile:false,build:{outDir:'dist/nukhab'},preview:{host:'127.0.0.1',port:0},logLevel:'error'});
const base=`http://127.0.0.1:${server.httpServer.address().port}`,results=[];
try {
  for(const [engine,type] of Object.entries({chromium,webkit})) {
    const browser=await type.launch();
    try {
      for(const scenario of ['slow-app-bundle','slow-native-hide','failed-logo-recovery','native-hide-retry']) {
        const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
        const errors=[],page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        await context.addInitScript(selected=>{
          globalThis.nativeStartupCalls=[];globalThis.nativeStartupFinishes=0;globalThis.nativeStartupFrames=[];
          globalThis.addEventListener('nukhab-startup-finished',()=>{globalThis.nativeStartupFinishes++;});
          const original=globalThis.Capacitor;
          globalThis.restoreNativeStartupBridge=()=>{globalThis.Capacitor=original;};
          const nativeGate=new Promise(resolve=>{globalThis.releaseNativeStartup=resolve;});
          globalThis.Capacitor={getPlatform:()=> 'ios',isNativePlatform:()=>true,Plugins:{SplashScreen:{hide:async options=>{
            const logo=globalThis.document.querySelector('.startup-brand-logo');
            globalThis.nativeStartupCalls.push({options,loaded:Boolean(logo?.complete&&logo?.naturalWidth),active:globalThis.nukhabStartup.active});
            if(selected==='native-hide-retry'&&globalThis.nativeStartupCalls.length===1)throw new Error('temporary native failure');
            let cover=globalThis.document.getElementById('native-cover-fixture');
            if(!cover){cover=globalThis.document.createElement('div');cover.id='native-cover-fixture';cover.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#04433d';globalThis.document.body.append(cover);}
            await nativeGate;cover.remove();
          }}}};
          const frame=()=>{
            const image=globalThis.document.querySelector('.startup-brand-logo'),brand=image?.parentElement;
            if(image){const box=image.getBoundingClientRect(),style=globalThis.getComputedStyle(brand);globalThis.nativeStartupFrames.push({x:box.x,y:box.y,width:box.width,height:box.height,transform:style.transform,
              brandHidden:style.visibility==='hidden'||Number(style.opacity)===0,inert:globalThis.document.querySelector('#app-root').inert});}
            globalThis.requestAnimationFrame(frame);
          };globalThis.requestAnimationFrame(frame);
        },scenario);
        await page.route('**/startup-bootstrap.js',async route=>{
          const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nglobalThis.restoreNativeStartupBridge();'});
        });
        await page.route('**/api/**',route=>route.fulfill({json:route.request().url().endsWith('/health')?{ok:true}:{}}));
        let releaseBundle;const bundleGate=new Promise(resolve=>{releaseBundle=resolve;});
        if(scenario!=='slow-native-hide'&&scenario!=='native-hide-retry')await page.route('**/assets/index-*.js',async route=>{await bundleGate;await route.continue();});
        if(scenario==='failed-logo-recovery'){
          await page.route('**/branding/nukhab/nukhab-white-640.webp*',route=>route.request().url().includes('startup-retry=')?route.continue():route.abort('failed'));
        }
        await page.goto(base,{waitUntil:'commit'});
        await page.waitForFunction(()=>globalThis.nativeStartupCalls.length>=1,{},{timeout:15000,polling:50}).catch(async error=>{
          const state=await page.evaluate(()=>({calls:globalThis.nativeStartupCalls,startup:globalThis.nukhabStartup&&{active:globalThis.nukhabStartup.active,nativeReady:globalThis.nukhabStartup.nativeReady},
            image:globalThis.document.querySelector('.startup-brand-logo')&&{complete:globalThis.document.querySelector('.startup-brand-logo').complete,width:globalThis.document.querySelector('.startup-brand-logo').naturalWidth},
            text:globalThis.document.body.innerText.slice(0,300)}));
          globalThis.console.error(JSON.stringify({engine,scenario,state,errors}));await writeFile(`${output}/failure-${engine}-${scenario}.json`,JSON.stringify({state,errors},null,2));throw error;
        });
        if(scenario==='native-hide-retry')await page.waitForFunction(()=>globalThis.nativeStartupCalls.length===2,{},{timeout:15000,polling:50});
        if(scenario==='slow-native-hide')await page.waitForFunction(()=>globalThis.document.querySelector('#startup-splash')?.dataset.brandHidden==='true',{},{timeout:15000,polling:50});
        assert.equal(await page.evaluate(()=>globalThis.document.querySelector('#app-root').inert),true);
        assert.equal(await page.evaluate(()=>globalThis.nukhabStartup.nativeReady),false);
        assert.equal(await page.locator('meta[name="viewport"]').getAttribute('content'),'width=device-width, initial-scale=1.0,viewport-fit=cover');
        await page.evaluate(()=>globalThis.releaseNativeStartup());
        await page.waitForFunction(()=>globalThis.nukhabStartup.nativeReady,{},{timeout:15000,polling:50});
        if(scenario==='failed-logo-recovery'){
          await page.locator('[data-startup-recovery]').waitFor({state:'visible'});
          await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();
          await page.waitForFunction(()=>globalThis.document.querySelector('.startup-brand-logo').naturalWidth>0,{},{timeout:15000,polling:50});
        }
        if(scenario==='slow-app-bundle'){
          assert.equal(await page.evaluate(()=>globalThis.nukhabStartup.active),true);
          if(engine==='chromium') {
            // Capture the painted startup while the app bundle is deliberately paused.
            const session=await context.newCDPSession(page);
            const frame=await session.send('Page.captureScreenshot',{format:'png'});
            await writeFile(`${output}/fixed-logo-${engine}.png`,Buffer.from(frame.data,'base64'));await session.detach();
          }
        }
        releaseBundle();await page.locator('#startup-splash').waitFor({state:'detached'});await page.getByLabel('رقم الدخول',{exact:true}).waitFor();
        await page.evaluate(()=>{globalThis.dispatchEvent(new globalThis.Event('focus'));globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange'));});
        await page.waitForTimeout(180);
        const state=await page.evaluate(()=>({calls:globalThis.nativeStartupCalls,finishes:globalThis.nativeStartupFinishes,frames:globalThis.nativeStartupFrames}));
        assert.equal(state.calls.length,scenario==='native-hide-retry'?2:1);assert.equal(state.finishes,1);
        assert.ok(state.calls.every(call=>call.options.fadeOutDuration===0&&call.active));
        for(const frame of state.frames){
          assert.equal(frame.width,160);assert.equal(frame.height,192);assert.equal(frame.transform,'none');
          assert.ok(Math.abs(frame.x+80-195)<=.5&&Math.abs(frame.y+96-422)<=.5,'the logo remains at the exact viewport center');
          if(!frame.inert)assert.equal(frame.brandHidden,true,'no logo may overlay the revealed page');
        }
        assert.deepEqual(errors,[]);results.push({engine,scenario,passed:true,physicalDevice:false});
        globalThis.console.log(`Native startup: ${engine} ${scenario} passed.`);
        await context.close();
      }
    } finally {await browser.close();}
  }
  await writeFile(`${output}/native-browser.json`,JSON.stringify({physicalDevice:false,bridge:'simulated injected Capacitor proxy',cases:results.length,results},null,2));
  globalThis.console.log(`Native startup handoff: ${results.length} Chromium/WebKit cases passed; painted local cover, exact center, delayed/failed hide, asset recovery and no replay. Native device testing remains separate.`);
} finally {server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}
