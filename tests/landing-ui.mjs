import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];const errors=[];
for(const width of [320,360,390,520,600,768,1024,1440,1920]){
 const context=await browser.newContext({viewport:{width,height:950}});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
 await expect(page.getByRole('heading',{name:'Find the right second film.'})).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Landing overflow ${width}`);
 await expect(page.locator('.qloo-result-placeholder')).toBeVisible();
 assert.equal(await page.locator('.showcase-companion').count(),0);
 await page.getByText('What does it actually do?',{exact:true}).click();
 await expect(page.locator('.faq-list details').first()).toHaveAttribute('open','');
 if(width===390||width===1440){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`test-results/landing-${width}.png`,fullPage:true});}
 if(width===390||width===1440){
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  writeFileSync(`test-results/landing-accessibility-${width}.json`,JSON.stringify(audit.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))})),null,2));
  assert.deepEqual(audit.violations,[],`Landing accessibility violations at ${width}`);
  results.push({audit:'landing',width,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length}))});
 }
 await page.getByRole('link',{name:'Find my second film',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Find your second film.'})).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Workspace overflow ${width}`);
 if(width<=600){
  const toggle=page.getByRole('button',{name:'Edit the brief',exact:false});
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(page.getByLabel('City',{exact:true})).toBeHidden();
  await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(page.getByLabel('City',{exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Expanded brief overflow ${width}`);
  await page.locator('#runtime').fill('160');
  await expect(page.getByRole('heading',{name:'Your Qloo results will appear here.',exact:true})).toBeVisible();
  assert.equal(await page.locator('.companion-card').count(),0);
  await page.locator('#runtime').fill('240');
  await toggle.click();
 }
 await page.getByRole('button',{name:'Inspect evidence',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Show your working.',exact:true})).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Modal overflow ${width}`);
 await page.keyboard.press('Escape');
 if(width===390||width===1440){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`test-results/workspace-refined-${width}.png`,fullPage:true});}
 if(width===390||width===1440){
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  writeFileSync(`test-results/workspace-accessibility-${width}.json`,JSON.stringify(audit.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))})),null,2));
  assert.deepEqual(audit.violations,[],`Workspace accessibility violations at ${width}`);
  results.push({audit:'workspace',width,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length}))});
 }
 await page.getByRole('button',{name:'Film library',exact:true}).click();
 await expect(page.getByRole('button',{name:'Add a film',exact:true})).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Library overflow ${width}`);
 await page.getByRole('button',{name:'Add a film',exact:true}).click();
 await expect(page.getByLabel('Film title',{exact:true})).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Add film dialog overflow ${width}`);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Event brief',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your next programme starts at the desk.'})).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Event brief overflow ${width}`);
 await page.getByRole('button',{name:'Programming desk',exact:true}).click();
 await page.getByRole('button',{name:'Second Feature home',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Find the right second film.'})).toBeVisible();
 await page.goBack();
 await expect(page.getByRole('heading',{name:'Find your second film.'})).toBeVisible();
 results.push({width,landing:true,workspace:true,mobileBrief:width<=600,modal:true,backNavigation:true,overflow:false});
 await context.close();
}
const page=await browser.newPage({viewport:{width:390,height:850},reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await page.getByRole('link',{name:'Find my second film',exact:true}).first().click();
await expect(page.getByRole('heading',{name:'Your Qloo results will appear here.',exact:true})).toBeVisible();
results.push({reducedMotion:true,liveDefault:true,noSyntheticResults:true});
assert.deepEqual(errors,[]);
console.log(JSON.stringify({passed:true,results,pageErrors:errors}));
await browser.close();
