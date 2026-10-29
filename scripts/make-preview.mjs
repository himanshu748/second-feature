import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const assets='preview-dist/assets';
const js=readFileSync(`${assets}/${readdirSync(assets).find(f=>f.endsWith('.js'))}`,'utf8').replace(/<\/script/gi,'<\\/script');
const css=readFileSync(`${assets}/${readdirSync(assets).find(f=>f.endsWith('.css'))}`,'utf8');
writeFileSync('second-feature-preview.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111211"><title>Second Feature | Live Backend Required</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`);
console.log('Built layout preview. Live recommendations require the deployed backend; no generated recommendations or credentials are included.');
