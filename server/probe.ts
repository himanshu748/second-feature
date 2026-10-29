// Safe live smoke probe. Reads the key from the server environment and prints summaries only.
// Run: npx tsx server/probe.ts [--plan]
import { defaultBrief, films } from '../src/lib/catalog';
import { ApiError, exactMatch, generateLivePlan, QlooClient, resolveSeed } from './qloo';

async function main() {
  const brief = defaultBrief;
  const client = new QlooClient();
  console.log(JSON.stringify({status:{configured:client.configured}}));
  if (!client.configured) return;
  if (process.argv.includes('--plan-only')) {
    const plan=await generateLivePlan(brief,films,client);
    console.log(JSON.stringify({step:'full-plan',mode:plan.mode,proposalCount:plan.proposals.length,partnerCount:plan.partners.length,warnings:plan.warnings,tools:plan.traces.map(t=>({tool:t.tool,status:t.status})),proposals:plan.proposals.map(p=>({title:p.film.title,coreRank:p.evidence.coreRank,reachRank:p.evidence.reachRank,totalMinutes:p.totalMinutes}))}));
    return;
  }
  const identities:{name:string;id:string;audience:'core'|'reach'}[]=[];
  for (const audience of ['core','reach'] as const) {
    for (const name of audience === 'core' ? brief.coreSeeds : brief.reachSeeds) {
      const {seed,entity,category}=await resolveSeed(client,name);
      console.log(JSON.stringify({step:'search',audience,name:seed.name,category,year:seed.year,uniqueExactMatch:true}));
      identities.push({name:seed.name,id:entity.id,audience});
    }
  }
  const anchor=films.find(f=>f.id === brief.anchorId)!;
  const anchorCandidates=await client.search(anchor.title);
  const matchedAnchor=exactMatch(anchorCandidates,anchor.title,anchor.year,true);
  console.log(JSON.stringify({step:'anchor',name:anchor.title,expectedYear:anchor.year,exactMovieAndYear:Boolean(matchedAnchor),candidates:anchorCandidates.slice(0,4).map(e=>({name:e.name,types:e.types,year:e.year}))}));
  for (const audience of ['core','reach'] as const) {
    const ids=[...new Set([...(matchedAnchor ? [matchedAnchor.id] : []),...identities.filter(s=>s.audience === audience).map(s=>s.id)])];
    const entities=await client.insights(ids,'movie');
    console.log(JSON.stringify({step:'movie-insights',audience,signalCount:ids.length,returned:entities.length,names:entities.slice(0,5).map(e=>e.name)}));
  }
  const placeIds=[...new Set([...(matchedAnchor ? [matchedAnchor.id] : []),...identities.map(s=>s.id)])];
  const places=await client.insights(placeIds,'place',brief.city);
  console.log(JSON.stringify({step:'place-insights',city:brief.city,signalCount:placeIds.length,returned:places.length,prospects:places.slice(0,3).map(e=>({name:e.name,hasAddress:Boolean(e.address)}))}));
  if (process.argv.includes('--plan')) {
    const plan=await generateLivePlan(brief,films,client);
    console.log(JSON.stringify({step:'full-plan',mode:plan.mode,proposalCount:plan.proposals.length,partnerCount:plan.partners.length,warningCount:plan.warnings.length,tools:plan.traces.map(t=>({tool:t.tool,status:t.status})),proposals:plan.proposals.map(p=>({title:p.film.title,coreRank:p.evidence.coreRank,reachRank:p.evidence.reachRank,totalMinutes:p.totalMinutes}))}));
  }
}
main().catch(e=>{
  console.error(JSON.stringify(e instanceof ApiError ? {error:e.message,code:e.code,status:e.status} : {error:'Probe failed without printing sensitive exception details.'}));
  process.exitCode=1;
});
