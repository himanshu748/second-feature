import type { Brief, Evidence, Film, Partner, Plan, Trace } from '../src/lib/types';
import { rankProposals, strategyScore } from '../src/lib/engine';

export const QLOO_ORIGIN = 'https://hackathon.api.qloo.com';
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'upstream_error') { super(message); }
}
export interface Entity { id:string; name:string; types:string[]; year?:number; address?:string; }
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj | undefined => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : undefined;
const str = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;
export function normalizeName(s:string):string { return s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,''); }

export function parseEntities(payload: unknown): Entity[] {
  const root = object(payload);
  if (root?.success === false || root?.error) throw new ApiError(502,'Qloo reported an unsuccessful response.','invalid_response');
  const results = root?.results;
  const raw = Array.isArray(results) ? results : object(results)?.entities;
  if (!Array.isArray(raw)) throw new ApiError(502,'Qloo returned an unsupported response shape.','invalid_response');
  return raw.map((v):Entity => {
    const e = object(v), p = object(e?.properties);
    const id = str(e?.entity_id) ?? str(e?.id), name = str(e?.name);
    if (!id || !name) throw new ApiError(502,'Qloo returned an entity without a name or ID.','invalid_response');
    const types = Array.isArray(e?.types) ? e.types.filter((t):t is string => typeof t === 'string') : typeof e?.type === 'string' ? [e.type] : [];
    const date = p?.release_year ?? p?.release_date ?? p?.year ?? e?.year;
    const match = typeof date === 'number' ? date : typeof date === 'string' && /^\d{4}(?:-|$)/.test(date) ? Number(date.slice(0,4)) : undefined;
    const year = match && Number.isInteger(match) && match >= 1880 && match <= 2200 ? match : undefined;
    const address = str(p?.address) ?? str(e?.address);
    return { id, name, types, ...(year ? {year} : {}), ...(address ? {address} : {}) };
  });
}

export interface QlooOptions { apiKey?:string; baseUrl?:string; fetch?:typeof fetch; timeoutMs?:number; retries?:number; ttlMs?:number; requestIntervalMs?:number; sleep?:(ms:number)=>Promise<void>; }
export class QlooClient {
  private readonly key:string;
  private readonly base:string;
  private readonly fetcher:typeof fetch;
  private readonly timeout:number;
  private readonly retries:number;
  private readonly ttl:number;
  private readonly sleep:(ms:number)=>Promise<void>;
  private readonly cache = new Map<string,{expires:number; entities:Entity[]}>();
  private nextRequestAt = 0;
  private readonly interval:number;
  constructor(options:QlooOptions = {}) {
    this.key = (options.apiKey ?? process.env.QLOO_API_KEY ?? '').trim();
    this.base = options.baseUrl ?? process.env.QLOO_BASE_URL ?? QLOO_ORIGIN;
    if (this.base !== QLOO_ORIGIN && this.base !== QLOO_ORIGIN + '/') throw new ApiError(500,'QLOO_BASE_URL must be https://hackathon.api.qloo.com.','invalid_configuration');
    this.fetcher = options.fetch ?? fetch;
    this.interval = Math.max(0,Math.min(options.requestIntervalMs ?? 650,5000));
    this.timeout = Math.max(10, Math.min(options.timeoutMs ?? 8000,15000));
    this.retries = Math.max(0, Math.min(options.retries ?? 1,2));
    this.ttl = Math.max(0,Math.min(options.ttlMs ?? 300000,600000));
    this.sleep = options.sleep ?? (ms => new Promise(resolve=>setTimeout(resolve,ms)));
  }
  get configured():boolean { return Boolean(this.key); }
  private async request(path:string, params:Record<string,string>):Promise<Entity[]> {
    if (!this.configured) throw new ApiError(503,'Live mode is not configured. Add QLOO_API_KEY on the server.','not_configured');
    const url = new URL(path,this.base);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
    const cacheKey = url.toString(), hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return structuredClone(hit.entities);
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      // Pace the shared client to protect a hackathon key from bursts.
      const wait = Math.max(0,this.nextRequestAt-Date.now());
      this.nextRequestAt = Math.max(Date.now(),this.nextRequestAt)+this.interval;
      if (wait) await this.sleep(wait);
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),this.timeout);
      try {
        const response = await this.fetcher(url,{method:'GET', headers:{'X-Api-Key':this.key, Accept:'application/json'}, signal:controller.signal, redirect:'error'});
        if (response.status === 429 && attempt < this.retries) {
          const retry = Number(response.headers.get('retry-after'));
          await response.body?.cancel();
          clearTimeout(timer);
          if (Number.isFinite(retry) && retry > 15) throw new ApiError(429,'Qloo rate limit requires a longer cooldown. Try again later. No sample fallback was used.','rate_limited');
          await this.sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 2500 * (attempt+1));
          continue;
        }
        if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502,`Qloo request failed with HTTP ${response.status}. No sample fallback was used.`,response.status === 429 ? 'rate_limited' : 'upstream_error');
        let payload: unknown;
        try { payload = await response.json(); } catch { throw new ApiError(502,'Qloo returned invalid JSON.','invalid_response'); }
        const entities = parseEntities(payload);
        if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(cacheKey,{expires:Date.now()+this.ttl,entities:structuredClone(entities)});
        return entities;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (controller.signal.aborted) throw new ApiError(504,'Qloo request timed out. No sample fallback was used.','timeout');
        throw new ApiError(502,'Could not reach Qloo. No sample fallback was used.','network_error');
      } finally { clearTimeout(timer); }
    }
    throw new ApiError(429,'Qloo rate limit reached.','rate_limited');
  }
  async search(query:string):Promise<Entity[]> { return this.request('/search',{query}); }
  async insights(ids:string[], type:'movie'|'place', city?:string):Promise<Entity[]> {
    if (!ids.length) return [];
    const params:Record<string,string> = {'filter.type':`urn:entity:${type}`,'signal.interests.entities':[...new Set(ids)].join(','),take:'50'};
    // Official example: https://github.com/qloo/docs-public/blob/main/recipes/recipes.md
    if (type === 'place' && city) params['filter.location.query'] = city;
    return this.request('/v2/insights',params);
  }
}

export const SEED_TYPES = ['person','artist','book','movie','brand','tv_show','podcast','destination','place','video_game'] as const;
export type SeedType = typeof SEED_TYPES[number];
export interface ParsedSeed { name:string; type?:SeedType; year?:number; }
/** Explicit category prefixes are local disambiguation hints, never part of the search label. */
export function parseSeed(input:string):ParsedSeed {
  const trimmed = input.trim();
  const prefix = /^([a-z_]+)\s*:\s*(.*)$/i.exec(trimmed);
  let name = trimmed, type:SeedType | undefined;
  if (prefix && (SEED_TYPES as readonly string[]).includes(prefix[1].toLowerCase())) {
    type = prefix[1].toLowerCase() as SeedType;
    name = prefix[2].trim();
  }
  let year:number | undefined;
  const dated = type === 'movie' ? /^(.*?)\s*\((\d{4})\)$/.exec(name) : null;
  if (dated) { name = dated[1].trim(); year = Number(dated[2]); }
  if (!name || (year !== undefined && (year < 1880 || year > 2200))) throw new ApiError(422,'Use type:name with a nonempty name and an optional movie year, for example movie:In the Mood for Love (2000).','invalid_seed');
  return {name,...(type ? {type}:{}),...(year !== undefined ? {year}:{})};
}
export function exactMatch(candidates:Entity[], name:string, year?:number, type:SeedType | boolean = false):Entity | undefined {
  const category = type === true ? 'movie' : type || undefined;
  const matches = candidates.filter(e => normalizeName(e.name) === normalizeName(name) && (!category || e.types.includes(`urn:entity:${category}`)) && (year === undefined || e.year === year));
  const unique = [...new Map(matches.map(e => [e.id.toLowerCase(),e])).values()];
  // Multiple returned categories are ambiguous even if an upstream ID is repeated.
  const categories = new Set(matches.flatMap(e=>e.types.filter(t=>t.startsWith('urn:entity:'))));
  return unique.length === 1 && (category || categories.size <= 1) ? unique[0] : undefined;
}
export async function resolveSeed(client:QlooClient, input:string):Promise<{seed:ParsedSeed; entity:Entity; category:string}> {
  const seed = parseSeed(input);
  const candidates = await client.search(seed.name);
  const entity = exactMatch(candidates,seed.name,seed.year,seed.type);
  if (!entity) {
    const exact = candidates.filter(e=>normalizeName(e.name) === normalizeName(seed.name));
    const available = [...new Set(exact.flatMap(e=>e.types).filter(t=>t.startsWith('urn:entity:')).map(t=>t.slice('urn:entity:'.length)).filter(t=>(SEED_TYPES as readonly string[]).includes(t)))];
    const examples = (available.length ? available : ['person','artist','movie']).map(t=>`${t}:${seed.name}`).join(' or ');
    throw new ApiError(422,`Seed “${input}” has no unique exact ${seed.type ? seed.type + ' ' : ''}match. ${seed.type ? 'Confirm its exact name or add a movie year if applicable.' : 'Specify a category using type:name, for example ' + examples + '.'} No alternate entity was substituted.`,'unresolved_seed');
  }
  return {seed,entity,category:seed.type ?? (entity.types.filter(t=>t.startsWith('urn:entity:')).map(t=>t.slice('urn:entity:'.length)).join(', ') || 'unspecified')};
}
export function evidenceFromLists(films:Film[], resolved:Map<string,Entity>, core:Entity[], reach:Entity[]):Evidence[] {
  const positions = (entities:Entity[]) => {
    const map = new Map<string,number>();
    entities.forEach((e,i) => { if (!map.has(e.id.toLowerCase())) map.set(e.id.toLowerCase(),i+1); });
    return map;
  };
  const c = positions(core), r = positions(reach);
  return films.flatMap(f => {
    const entity = resolved.get(f.id);
    if (!entity) return [];
    const key = entity.id.toLowerCase();
    return [{filmId:f.id,entityId:entity.id,coreRank:c.get(key) ?? null,reachRank:r.get(key) ?? null,source:'live' as const}];
  });
}

/** Bounded deterministic plan -> tools -> check -> replan. No LLM and no inferred probability. */
export async function generateLivePlan(brief:Brief, films:Film[], client:QlooClient):Promise<Plan> {
  if (!client.configured) throw new ApiError(503,'Live mode is not configured.','not_configured');
  const anchor = films.find(f=>f.id === brief.anchorId);
  if (!anchor) throw new ApiError(400,'The anchor must be present in the catalog.','invalid_brief');
  if (anchor.rights === 'unavailable' || brief.excludedIds.includes(anchor.id)) throw new ApiError(422,'The anchor is unavailable or excluded. Select another anchor.','invalid_anchor');
  const traces:Trace[] = [{tool:'plan',status:'ok',detail:'Bounded deterministic workflow: resolve each seed and catalog identity, request two independent movie lists, check hard constraints then make at most one evidence-preserving replan. No LLM is used.'}];
  const warnings = ['Qloo ranks indicate taste relationships, not turnout or partner willingness.', 'Screening rights must be verified with the rights holder before booking.'];
  const resolvedSeeds:Plan['resolvedSeeds'] = [];
  for (const audience of ['core','reach'] as const) {
    const seeds = audience === 'core' ? brief.coreSeeds : brief.reachSeeds;
    for (const name of seeds) {
      const {seed,entity,category} = await resolveSeed(client,name);
      resolvedSeeds.push({name:seed.name,id:entity.id,audience});
      traces.push({tool:'resolve-seed',status:'ok',detail:`${audience}: ${seed.name} matched by exact normalised name and category ${category}${seed.year ? ` (${seed.year})` : ''}.`});
    }
  }
  const resolved = new Map<string,Entity>();
  // Resolve the anchor first so a missing identity does not trigger a full catalog scan.
  const anchorEntity = exactMatch(await client.search(anchor.title),anchor.title,anchor.year,'movie');
  if (!anchorEntity) throw new ApiError(422,'The anchor could not be resolved to its exact movie title and year. No substitute was used.','unresolved_anchor');
  resolved.set(anchor.id,anchorEntity);
  // Do not spend upstream calls on candidates that can never satisfy hard constraints.
  const eligible = films.filter(f=>f.id !== anchor.id && f.rights !== 'unavailable' && !brief.excludedIds.includes(f.id) && anchor.minutes + brief.intervalMinutes + f.minutes <= brief.maxMinutes);
  // At most three concurrent lookups per batch, never an unbounded upstream burst.
  for (let i=0; i<eligible.length; i+=3) {
    const batch = eligible.slice(i,i+3);
    const matches = await Promise.all(batch.map(async film=>({film,entity:exactMatch(await client.search(film.title),film.title,film.year,'movie')})));
    for (const {film,entity} of matches) {
      if (entity) resolved.set(film.id,entity);
      else warnings.push(`No unique exact Qloo movie match with verified year for ${film.title} (${film.year}). It cannot receive a live rank.`);
    }
  }
  traces.push({tool:'resolve-catalog',status:resolved.size === eligible.length + 1 ? 'ok':'warning',detail:`${resolved.size} of ${eligible.length + 1} eligible catalog movies including the anchor resolved by exact name, movie type and year. Skipped ${films.length - eligible.length - 1} hard-ineligible titles before lookup. At most three concurrent catalog lookups. No substitute titles were used.`});
  const coreIds = [...new Set([anchorEntity.id,...resolvedSeeds.filter(s=>s.audience === 'core').map(s=>s.id)])];
  const reachIds = [...new Set([anchorEntity.id,...resolvedSeeds.filter(s=>s.audience === 'reach').map(s=>s.id)])];
  const core = await client.insights(coreIds,'movie');
  const reach = await client.insights(reachIds,'movie');
  traces.push({tool:'movie-insights',status:core.length && reach.length ? 'ok':'warning',detail:`Independent core and reach requests returned ${core.length} and ${reach.length} entities. Only exact resolved catalog IDs retain their original returned ordinal positions. The anchor contributes to both signals.`});
  const evidence = evidenceFromLists(films,resolved,core,reach);
  // Plan the top three by observed utility first, then run a separate hard-constraint tool.
  const firstPass = evidence.filter(e=>e.filmId !== anchor.id).sort((a,b)=>strategyScore(brief.strategy,b.coreRank,b.reachRank)-strategyScore(brief.strategy,a.coreRank,a.reachRank) || a.filmId.localeCompare(b.filmId)).slice(0,3);
  let proposals = rankProposals({brief,films,evidence:firstPass});
  traces.push({tool:'constraint-check',status:proposals.length === 3 ? 'ok':'warning',detail:`${proposals.length} of the initial three candidates satisfy rights status, exclusions, no self-pairing and total runtime. Strategy utilities use only observed ordinal ranks.`});
  if (proposals.length < 3) {
    proposals = rankProposals({brief,films,evidence});
    traces.push({tool:'replan',status:proposals.length === 3 ? 'ok':'warning',detail:`Expanded to all ${evidence.length} exactly resolved catalog candidates once with the same strategy and hard constraints. Found ${proposals.length} feasible proposals without synthetic substitution.`});
  } else traces.push({tool:'replan',status:'ok',detail:'Three feasible proposals found. No replan needed.'});
  if (proposals.length < 3) warnings.push(`Only ${proposals.length} eligible proposals within the two top-50 lists. No missing ranks were invented and no constraints were relaxed.`);
  let partners:Partner[] = [];
  try {
    const places = await client.insights([...new Set([...coreIds,...reachIds])],'place',brief.city);
    partners = places.filter(e=>e.types.includes('urn:entity:place') || e.types.every(t=>t==='urn:entity')).slice(0,3).map(e=>({id:e.id,entityId:e.id,name:e.name,kind:'Local prospect',address:e.address ?? 'Address not supplied by Qloo',note:'Qloo taste-related place prospect. Contact details, location and willingness to partner require independent verification.',source:'live'}));
    if (!partners.length) warnings.push('Qloo returned no verifiable place prospects for this city.');
    traces.push({tool:'place-insights',status:partners.length ? 'ok':'warning',detail:`${partners.length} prospects from Qloo place results filtered by the city query. Names and any addresses are returned data, not partnership claims.`});
  } catch (e) {
    warnings.push(e instanceof ApiError ? `Partner discovery unavailable: ${e.message}` : 'Partner discovery unavailable.');
    traces.push({tool:'place-insights',status:'warning',detail:'Partner request failed. No fictional prospects were substituted.'});
  }
  return {mode:'live',proposals,partners,traces,warnings,resolvedSeeds,generatedAt:new Date().toISOString()};
}
