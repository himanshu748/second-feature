import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { defaultBrief, films } from '../src/lib/catalog';
import { ApiError, QlooClient, exactMatch, parseEntities, evidenceFromLists, generateLivePlan, parseSeed, resolveSeed, SEED_TYPES, type Entity } from '../server/qloo';
import { createAppServer } from '../server/index';
import { planSchema } from '../server/schema';
const movie = (id:string,name:string,year:number) => ({entity_id:id,name,types:['urn:entity:movie'],properties:{release_year:year}});
const entity = (id:string,name = id):Entity=>({id,name,types:['urn:entity:movie']});
const response = (entities:unknown[], search=false)=>new Response(JSON.stringify({results:search ? entities : {entities}}),{status:200,headers:{'content-type':'application/json'}});
const clientWith = (fn:typeof fetch, extra:Partial<ConstructorParameters<typeof QlooClient>[0]>={}) => new QlooClient({apiKey:'test-private-key',fetch:fn,requestIntervalMs:0,...extra});

test('response parser accepts search and insights shapes without retaining raw data',()=>{
  const raw = movie('id','Film',2000);
  assert.deepEqual(parseEntities({results:[raw]}),[{id:'id',name:'Film',types:['urn:entity:movie'],year:2000}]);
  assert.equal(parseEntities({results:{entities:[{...raw,properties:{release_date:'2000-02-01',address:'Actual supplied address'}}]}})[0].year,2000);
  assert.deepEqual(parseEntities({results:{entities:[]}}),[]);
  assert.throws(()=>parseEntities({results:{}}),ApiError);
  assert.throws(()=>parseEntities({results:[{name:'Missing ID'}]}),ApiError);
});
test('matching rejects different titles, years, ambiguous identity and non-movie types',()=>{
  const candidate:Entity={id:'x',name:'Cléo from 5 to 7',year:1962,types:['urn:entity:movie']};
  assert.equal(exactMatch([candidate],'Cleo from 5 to 7',1962,true)?.id,'x');
  assert.equal(exactMatch([candidate],'Cleo from 5 to 7',1963,true),undefined);
  assert.equal(exactMatch([candidate],'Cleo',1962,true),undefined);
  assert.equal(exactMatch([{...candidate,year:undefined}],candidate.name,1962,true),undefined);
  assert.equal(exactMatch([{...candidate,types:['urn:entity:book']}],candidate.name,1962,true),undefined);
  assert.equal(exactMatch([candidate,{...candidate,id:'different'}],candidate.name),undefined);
});
test('adapter uses only allowed origin, safe headers and documented GET parameters',async()=>{
  assert.throws(()=>new QlooClient({baseUrl:'https://evil.test'}),ApiError);
  assert.throws(()=>new QlooClient({baseUrl:'http://hackathon.api.qloo.com'}),ApiError);
  assert.throws(()=>new QlooClient({baseUrl:'https://hackathon.api.qloo.com/else'}),ApiError);
  const calls:{url:URL;init?:RequestInit}[]=[];
  const client=clientWith(async(input,init)=>{calls.push({url:new URL(String(input)),init});return response([]);});
  await client.search('Wong Kar-wai');
  await client.insights(['one','two','one'],'movie');
  await client.insights(['one'],'place','New York');
  assert.equal(calls[0].url.pathname,'/search');
  assert.equal(calls[0].url.searchParams.get('query'),'Wong Kar-wai');
  assert.equal(calls[0].url.searchParams.has('types'),false);
  assert.equal(calls[1].url.pathname,'/v2/insights');
  assert.equal(calls[1].url.searchParams.get('signal.interests.entities'),'one,two');
  assert.equal(calls[1].url.searchParams.get('take'),'50');
  assert.equal(calls[2].url.searchParams.get('filter.type'),'urn:entity:place');
  assert.equal(calls[2].url.searchParams.get('filter.location.query'),'New York');
  assert.equal(new Headers(calls[0].init?.headers).get('X-Api-Key'),'test-private-key');
  assert.equal(calls[0].init?.redirect,'error');
});
test('cache is private, TTL bounded and defensive copies prevent mutation',async()=>{
  let count=0;
  const client=clientWith(async()=>{count++;return response([movie('one','Title',2000)],true);});
  const first=await client.search('Title');first[0].name='Changed';
  assert.equal((await client.search('Title'))[0].name,'Title');assert.equal(count,1);
  const uncached=clientWith(async()=>{count++;return response([]);},{ttlMs:0});
  await uncached.search('x');await uncached.search('x');assert.equal(count,3);
});
test('429 retry bounded, upstream failures never become sample data',async()=>{
  let count=0;
  const client=clientWith(async()=>{count++;return count === 1 ? new Response('',{status:429,headers:{'retry-after':'2'}}) : response([]);},{sleep:async(ms)=>{assert.equal(ms,2000);}});
  assert.deepEqual(await client.search('x'),[]);assert.equal(count,2);
  const longCooldown=clientWith(async()=>new Response('',{status:429,headers:{'retry-after':'99'}}));
  await assert.rejects(()=>longCooldown.search('x'),(e:unknown)=>e instanceof ApiError && e.status === 429);
  const fail=clientWith(async()=>new Response('Do not leak raw upstream content',{status:401}));
  await assert.rejects(()=>fail.search('x'),(e:unknown)=>e instanceof ApiError && e.status === 502 && !e.message.includes('Do not leak'));
  let limits=0;
  const limited=clientWith(async()=>{limits++;return new Response('',{status:429});},{sleep:async()=>{}});
  await assert.rejects(()=>limited.search('x'),(e:unknown)=>e instanceof ApiError && e.status === 429);assert.equal(limits,2);
  const bad=clientWith(async()=>new Response('{broken',{status:200}));
  await assert.rejects(()=>bad.search('x'),(e:unknown)=>e instanceof ApiError && e.code === 'invalid_response');
  await assert.rejects(()=>clientWith(async()=>{throw new Error('secret');}).search('x'),(e:unknown)=>e instanceof ApiError && !e.message.includes('secret'));
});
test('fetch timeout is bounded and unconfigured requests fail explicitly',async()=>{
  const client=clientWith(async(_input,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')))),{timeoutMs:15});
  await assert.rejects(()=>client.search('x'),(e:unknown)=>e instanceof ApiError && e.status === 504);
  await assert.rejects(()=>new QlooClient({apiKey:''}).search('x'),(e:unknown)=>e instanceof ApiError && e.status === 503);
});
test('exact catalog IDs preserve returned positions and missing films have null ranks',()=>{
  const subset=films.slice(0,3), resolved=new Map(subset.map(f=>[f.id,entity(f.id)]));
  const evidence=evidenceFromLists(subset,resolved,[entity('outside'),entity(subset[1].id.toUpperCase())],[entity(subset[2].id)]);
  assert.equal(evidence[1].coreRank,2);assert.equal(evidence[1].reachRank,null);
  assert.equal(evidence[2].reachRank,1);assert.equal(evidence[0].coreRank,null);
  assert.equal(evidence[0].source,'live');
});
function liveMock(empty=false,placeFail=false):{client:QlooClient; calls:URL[]} {
  const calls:URL[]=[];
  const client=clientWith(async(input)=>{
    const u=new URL(String(input));calls.push(u);
    if(u.pathname === '/search') {
      const query=u.searchParams.get('query')!;
      const film=films.find(f=>f.title === query);
      return response(film ? [movie(film.id,film.title,film.year)] : [{entity_id:query,name:query,types:[`urn:entity:${query === 'Nujabes' ? 'artist' : query === 'Kafka on the Shore' ? 'book' : 'person'}`]}],true);
    }
    if(u.searchParams.get('filter.type') === 'urn:entity:place') return placeFail ? new Response('',{status:503}) : response([{entity_id:'place',name:'Actual Qloo place',types:['urn:entity'],properties:{address:'100 Actual Street'}}]);
    const isCore=u.searchParams.get('signal.interests.entities')?.includes('Wong Kar-wai');
    const ranked=isCore ? films.slice(1,6) : films.slice(1,6).reverse();
    return response(empty ? [] : ranked.map(f=>movie(f.id,f.title,f.year)));
  });
  return {client,calls};
}
test('live plan resolves each seed, makes independent rankings and uses actual place data',async()=>{
  const {client,calls}=liveMock();
  const plan=await generateLivePlan(defaultBrief,films,client);
  assert.equal(plan.mode,'live');assert.equal(plan.proposals.length,3);
  assert.equal(plan.resolvedSeeds.length,4);
  assert.ok(plan.proposals.every(p=>p.evidence.source === 'live'));
  assert.equal(plan.partners[0].name,'Actual Qloo place');assert.equal(plan.partners[0].address,'100 Actual Street');
  const movieCalls=calls.filter(u=>u.searchParams.get('filter.type') === 'urn:entity:movie');
  assert.equal(movieCalls.length,2);
  assert.notEqual(movieCalls[0].searchParams.get('signal.interests.entities'),movieCalls[1].searchParams.get('signal.interests.entities'));
  assert.ok(movieCalls.every(u=>u.searchParams.get('signal.interests.entities')?.includes(defaultBrief.anchorId)));
});
test('hard-ineligible catalog titles are skipped before lookup without relaxing constraints',async()=>{
  const {client}=liveMock();
  const plan=await generateLivePlan({...defaultBrief,strategy:'core',maxMinutes:400,excludedIds:[films[1].id]},films,client);
  assert.equal(plan.proposals.length,3);
  assert.ok(plan.proposals.every(p=>p.film.id !== films[1].id && p.evidence.source === 'live'));
  assert.ok(plan.traces.some(t=>t.tool === 'resolve-catalog' && t.detail.includes('Skipped 1 hard-ineligible')));
  assert.ok(plan.traces.some(t=>t.tool === 'replan'));
});
test('empty movie lists and place errors return explicit warnings with no synthetic substitution',async()=>{
  const {client}=liveMock(true,true);
  const plan=await generateLivePlan(defaultBrief,films,client);
  assert.equal(plan.mode,'live');assert.deepEqual(plan.proposals,[]);assert.deepEqual(plan.partners,[]);
  assert.ok(plan.warnings.some(w=>w.includes('Only 0')));
  assert.ok(plan.warnings.some(w=>w.includes('Partner discovery unavailable')));
  assert.ok(plan.traces.some(t=>t.tool === 'replan' && t.status === 'warning'));
});
test('unresolved seeds and anchor fail instead of silently substituting',async()=>{
  const noMatches=clientWith(async()=>response([],true));
  await assert.rejects(()=>generateLivePlan(defaultBrief,films,noMatches),(e:unknown)=>e instanceof ApiError && e.code === 'unresolved_seed');
  const {client}=liveMock();
  await assert.rejects(()=>generateLivePlan({...defaultBrief,anchorId:'missing'},films,client),(e:unknown)=>e instanceof ApiError && e.code === 'invalid_brief');
  await assert.rejects(()=>generateLivePlan(defaultBrief,films.map(f=>f.id === defaultBrief.anchorId ? {...f,year:2001}:f),client),(e:unknown)=>e instanceof ApiError && e.code === 'unresolved_anchor');
});
test('zod bounds protect input sizes, time formats, runtime and duplicate IDs',()=>{
  assert.equal(planSchema.safeParse({brief:defaultBrief,films}).success,true);
  for(const b of [{...defaultBrief,maxMinutes:9999},{...defaultBrief,intervalMinutes:-1},{...defaultBrief,startsAt:'25:00'},{...defaultBrief,coreSeeds:['x'.repeat(121)]},{...defaultBrief,reachSeeds:Array(7).fill('x')}]) assert.equal(planSchema.safeParse({brief:b}).success,false);
  assert.equal(planSchema.safeParse({brief:defaultBrief,films:[films[0],films[0]]}).success,false);
  assert.equal(planSchema.safeParse({brief:defaultBrief,films:[{...films[0],minutes:-1}]}).success,false);
});
test('native HTTP status, search, live-only errors and invalid JSON',async()=>{
  const client=new QlooClient({apiKey:''});
  const server=createAppServer(client);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.deepEqual(await (await fetch(base+'/api/status')).json(),{configured:false});
    const search=await fetch(base+'/api/search?query=Movie');assert.equal(search.status,503);
    const missing=await fetch(base+'/api/search?query=');assert.equal(missing.status,400);
    const plan=await fetch(base+'/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brief:defaultBrief})});
    assert.equal(plan.status,503);assert.equal((await plan.json()).code,'not_configured');
    const invalid=await fetch(base+'/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:'{'});assert.equal(invalid.status,400);
    const large=await fetch(base+'/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(200001)});assert.equal(large.status,413);
  } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e ? reject(e):resolve()));}
});

test('typed seed parser supports every category and an optional explicit movie year',()=>{
  for (const type of SEED_TYPES) assert.deepEqual(parseSeed(` ${type}: A name `),{type,name:'A name'});
  assert.deepEqual(parseSeed(' MOVIE: In the Mood for Love (2000) '),{type:'movie',name:'In the Mood for Love',year:2000});
  assert.deepEqual(parseSeed('Tokyo: A Story'),{name:'Tokyo: A Story'});
  assert.throws(()=>parseSeed('person: '),(e:unknown)=>e instanceof ApiError && e.status === 422);
});
test('typed exact seed resolution filters URN category and preserves clean labels',async()=>{
  const calls:string[]=[];
  const client=clientWith(async input=>{
    const name=new URL(String(input)).searchParams.get('query')!;calls.push(name);
    return response([{entity_id:'artist',name,types:['urn:entity:artist']},{entity_id:'person',name,types:['urn:entity:person']}],true);
  });
  const result=await resolveSeed(client,'person:Wong Kar-wai');
  assert.equal(result.entity.id,'person');assert.equal(result.seed.name,'Wong Kar-wai');assert.equal(result.category,'person');
  assert.deepEqual(calls,['Wong Kar-wai']);
  await assert.rejects(()=>resolveSeed(client,'Wong Kar-wai'),(e:unknown)=>e instanceof ApiError && e.status === 422 && e.code === 'unresolved_seed' && e.message.includes('person:Wong Kar-wai') && e.message.includes('artist:Wong Kar-wai'));
  await assert.rejects(()=>resolveSeed(client,'book:Wong Kar-wai'),(e:unknown)=>e instanceof ApiError && e.status === 422);
});
test('typed movie seeds accept an optional year but never choose among duplicate movies',async()=>{
  const client=clientWith(async()=>response([movie('a','Title',2000),movie('b','Title',2001),{entity_id:'artist',name:'Title',types:['urn:entity:artist']}],true));
  assert.equal((await resolveSeed(client,'movie:Title (2000)')).entity.id,'a');
  await assert.rejects(()=>resolveSeed(client,'movie:Title'),(e:unknown)=>e instanceof ApiError && e.status === 422);
  assert.equal(exactMatch([{id:'same',name:'Title',types:['urn:entity:artist','urn:entity:person']}],'Title'),undefined);
});
test('live plans use typed seed resolution and report category without exposing prefixes as labels',async()=>{
  const {client}=liveMock();
  const plan=await generateLivePlan({...defaultBrief,coreSeeds:['person:Wong Kar-wai','movie:In the Mood for Love'],reachSeeds:['artist:Nujabes','person:Haruki Murakami']},films,client);
  assert.deepEqual(plan.resolvedSeeds.map(s=>s.name),['Wong Kar-wai','In the Mood for Love','Nujabes','Haruki Murakami']);
  assert.ok(plan.traces.some(t=>t.tool === 'resolve-seed' && t.detail.includes('category artist')));
});
test('catalog lookup skips impossible runtimes and bounds concurrent requests to three',async()=>{
  const calls:string[]=[];let active=0,maxActive=0;
  const client=clientWith(async input=>{
    const url=new URL(String(input));
    if (url.pathname !== '/search') return response([]);
    const query=url.searchParams.get('query')!;calls.push(query);active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
    const film=films.find(f=>f.title === query);
    return response(film ? [movie(film.id,film.title,film.year)] : [{entity_id:query,name:query,types:['urn:entity:person']}],true);
  });
  const anchor=films.find(f=>f.id === defaultBrief.anchorId)!;
  const brief={...defaultBrief,coreSeeds:['person:Core'],reachSeeds:['person:Reach'],maxMinutes:anchor.minutes+defaultBrief.intervalMinutes+90};
  await generateLivePlan(brief,films,client);
  const impossible=films.filter(f=>f.id !== anchor.id && anchor.minutes+brief.intervalMinutes+f.minutes > brief.maxMinutes);
  assert.ok(impossible.length);assert.ok(impossible.every(f=>!calls.includes(f.title)));assert.ok(maxActive<=3);
});
