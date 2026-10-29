import { test } from 'node:test';
import assert from 'node:assert/strict';
import { films, defaultBrief } from '../src/lib/catalog';
import { generateSamplePlan, rankProposals, sampleEvidence, strategyScore } from '../src/lib/engine';
import type { Brief, Evidence, Film } from '../src/lib/types';
const brief = (overrides:Partial<Brief> = {}):Brief => ({...defaultBrief,...overrides});

test('sample provides three ranked proposals with transparent provenance',()=>{
  const plan = generateSamplePlan(defaultBrief);
  assert.equal(plan.mode,'sample'); assert.equal(plan.proposals.length,3);
  assert.equal(plan.resolvedSeeds.length,0);
  assert.ok(plan.warnings.some(w=>w.includes('synthetic')));
  assert.ok(plan.partners.every(p=>p.name.includes('fictional') && p.source === 'sample'));
  assert.ok(plan.proposals.every(p=>p.evidence.source === 'sample' && !p.evidence.entityId && p.interpretation.includes('catalogue')));
  assert.ok(plan.proposals.every((p,i,a)=>i === 0 || a[i-1].score >= p.score));
});
test('synthetic ranks are deterministic and depend on each audience and anchor',()=>{
  const initial = sampleEvidence(defaultBrief,films);
  assert.deepEqual(initial,sampleEvidence(defaultBrief,films));
  const coreChanged = sampleEvidence(brief({coreSeeds:['A new taste']}),films);
  assert.notDeepEqual(initial.map(e=>e.coreRank),coreChanged.map(e=>e.coreRank));
  assert.deepEqual(initial.map(e=>e.reachRank),coreChanged.map(e=>e.reachRank));
  assert.notDeepEqual(initial,sampleEvidence(brief({anchorId:'perfect'}),films));
  assert.notDeepEqual(initial,sampleEvidence(brief({reachSeeds:['Another new taste']}),films));
});
test('hard constraints include anchor runtime and interval with exact boundary',()=>{
  const anchor = films[0], candidate = films[1];
  const evidence:Evidence[] = [{filmId:candidate.id,coreRank:1,reachRank:1,source:'sample'}];
  const catalog = [anchor,candidate];
  const run = (b:Brief, fs:Film[]=catalog)=>rankProposals({brief:b,films:fs,evidence});
  const total = anchor.minutes+candidate.minutes+20;
  assert.equal(run(brief({maxMinutes:total})).length,1);
  assert.equal(run(brief({maxMinutes:total-1})).length,0);
  assert.equal(run(brief({maxMinutes:total,intervalMinutes:21})).length,0);
  assert.equal(run(brief({excludedIds:[candidate.id]})).length,0);
  assert.equal(run(brief(),[anchor,{...candidate,rights:'unavailable'}]).length,0);
  assert.equal(run(brief(),[{...anchor,rights:'unavailable'},candidate]).length,0);
  assert.equal(run(brief({excludedIds:[anchor.id]})).length,0);
  assert.equal(run(brief({anchorId:'missing'})).length,0);
});
test('self-pairing is always excluded and unverified rights can be proposed',()=>{
  const evidence = films.map(f=>({filmId:f.id,coreRank:1,reachRank:1,source:'sample' as const}));
  const ranked = rankProposals({brief:defaultBrief,films,evidence});
  assert.equal(ranked.length,3);
  assert.ok(ranked.every(p=>p.film.id !== defaultBrief.anchorId));
  assert.ok(ranked.some(p=>p.film.rights === 'unverified'));
});
test('strategies use reciprocal ordinal utility and balance observed lists',()=>{
  assert.equal(strategyScore('core',2,1),0.5);
  assert.equal(strategyScore('bridge',1,4),0.5);
  assert.equal(strategyScore('bridge',4,1),0.5);
  assert.equal(strategyScore('bridge',1,null),0);
  assert.equal(strategyScore('discovery',null,1),0);
  assert.ok(strategyScore('discovery',20,2) > strategyScore('discovery',2,2));
  assert.equal(strategyScore('core',0,1),0);
  assert.equal(strategyScore('core',NaN,1),0);
  const fs = [films[0],...films.slice(1,4).map(f=>({...f,minutes:90}))];
  const evidence:Evidence[] = [
    {filmId:fs[1].id,coreRank:1,reachRank:30,source:'live'},
    {filmId:fs[2].id,coreRank:3,reachRank:3,source:'live'},
    {filmId:fs[3].id,coreRank:30,reachRank:1,source:'live'}
  ];
  const first = (strategy:Brief['strategy'])=>rankProposals({brief:brief({strategy}),films:fs,evidence})[0].film.id;
  assert.equal(first('core'),fs[1].id);
  assert.equal(first('bridge'),fs[2].id);
  assert.equal(first('discovery'),fs[3].id);
});
test('missing evidence remains absent and short lists warn without fallback',()=>{
  assert.deepEqual(rankProposals({brief:defaultBrief,films,evidence:[]}),[]);
  const plan = generateSamplePlan(brief({maxMinutes:100}));
  assert.deepEqual(plan.proposals,[]);
  assert.ok(plan.warnings.some(w=>w.includes('Only 0')));
  assert.deepEqual(generateSamplePlan(brief({city:'London'})).partners,[]);
});
