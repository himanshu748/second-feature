import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,QLOO_API_KEY:'',QLOO_BASE_URL:'https://hackathon.api.qloo.com',PORT:'3002'},stdio:'ignore'});
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 await expect.poll(async()=>{try{return (await (await fetch('http://127.0.0.1:3002/api/status')).json()).configured;}catch{return null;}},{timeout:10000}).toBe(false);
 const page=await browser.newPage({viewport:{width:390,height:850}});
 await page.goto('http://127.0.0.1:3002/#/workspace?mode=sample',{waitUntil:'networkidle'});
 await expect(page.getByRole('button',{name:'Qloo not connected'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Get Qloo recommendations',exact:true})).toBeDisabled();
 assert.equal(await page.locator('.companion-card').count(),0);
 await expect(page.getByText('No synthetic results will be substituted.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Reset brief',exact:true}).click();
 assert.equal(await page.locator('.companion-card').count(),0);
 await page.getByRole('button',{name:'Qloo not connected'}).click();
 assert.equal(await page.getByRole('button',{name:'Explore the sample workspace',exact:false}).count(),0);
 await expect(page.getByRole('button',{name:'Work with live Qloo evidence',exact:false})).toBeDisabled();
 console.log(JSON.stringify({passed:true,checks:['production defaults to live Qloo','sample query flag cannot enable fixtures in production','missing backend clearly blocks recommendations','reset cannot switch to sample','no production sample switch']}));
}finally{server.kill();await browser.close();}
