import { films as defaultCatalog } from './catalog';
import type { Brief, Evidence, Film, Plan, Proposal, RankInput } from './types';

const ordinal = (rank: number | null) => rank !== null && Number.isInteger(rank) && rank > 0 ? 1 / rank : 0;
/** Ordinal utility, not a probability or an attendance prediction. Missing observations stay missing. */
export function strategyScore(strategy: Brief['strategy'], coreRank: number | null, reachRank: number | null): number {
  const core = ordinal(coreRank), reach = ordinal(reachRank);
  if (strategy === 'core') return core;
  if (strategy === 'bridge') return Math.sqrt(core * reach);
  // Prefer reach rank, then reward a positive gap from core familiarity. Both lists must observe the film.
  if (!core || !reach) return 0;
  const novelty = Math.max(0, (coreRank! - reachRank!) / Math.max(coreRank!, reachRank!));
  return reach * (0.5 + 0.5 * novelty);
}

export function rankProposals({ brief, films, evidence }: RankInput): Proposal[] {
  const anchor = films.find(f => f.id === brief.anchorId);
  if (!anchor || anchor.rights === 'unavailable' || brief.excludedIds.includes(anchor.id)) return [];
  if (!Number.isFinite(brief.maxMinutes) || brief.maxMinutes <= 0 || !Number.isFinite(brief.intervalMinutes) || brief.intervalMinutes < 0 || !Number.isFinite(anchor.minutes) || anchor.minutes <= 0) return [];
  const observed = new Map(evidence.map(e => [e.filmId, e]));
  const seen = new Set<string>();
  return films.flatMap(film => {
    if (seen.has(film.id)) return [];
    seen.add(film.id);
    const totalMinutes = anchor.minutes + brief.intervalMinutes + film.minutes;
    if (film.id === anchor.id || film.rights === 'unavailable' || brief.excludedIds.includes(film.id) || !Number.isFinite(film.minutes) || film.minutes <= 0 || totalMinutes > brief.maxMinutes) return [];
    const e = observed.get(film.id);
    if (!e) return [];
    const score = strategyScore(brief.strategy, e.coreRank, e.reachRank);
    if (score <= 0) return [];
    const shared = anchor.themes.filter(t => film.themes.includes(t));
    const connection = shared.length ? `A connection through ${shared.slice(0,2).join(' and ')}, drawn from your catalogue’s editorial themes.` : `A contrasting perspective alongside ${anchor.title}, drawn from your catalogue’s editorial notes.`;
    const rationale = brief.strategy === 'core' ? 'Selected for the stronger connection to your regular audience references.' : brief.strategy === 'bridge' ? 'Selected to balance the two audience reference sets.' : 'Selected to favour reach beyond the core reference set.';
    return [{ film, score, evidence: e, totalMinutes, interpretation: `${connection} ${rationale} ${film.note}` }];
  }).sort((a,b) => b.score - a.score || a.film.id.localeCompare(b.film.id)).slice(0, 3);
}
export const rank = rankProposals;

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Explicit deterministic synthetic fixtures. These are never attributed to Qloo. */
export function sampleEvidence(brief: Brief, catalog: Film[]): Evidence[] {
  const list = (seeds: string[], audience: string) => [...catalog].sort((a,b) =>
    hash(`${audience}|${brief.anchorId}|${seeds.map(s => s.trim().toLowerCase()).sort().join('|')}|${a.id}`) -
    hash(`${audience}|${brief.anchorId}|${seeds.map(s => s.trim().toLowerCase()).sort().join('|')}|${b.id}`) || a.id.localeCompare(b.id));
  const core = new Map(list(brief.coreSeeds, 'core').map((f,i) => [f.id,i+1]));
  const reach = new Map(list(brief.reachSeeds, 'reach').map((f,i) => [f.id,i+1]));
  return catalog.map(f => ({ filmId:f.id, coreRank:brief.coreSeeds.length ? core.get(f.id)! : null, reachRank:brief.reachSeeds.length ? reach.get(f.id)! : null, source:'sample' }));
}

export function generateSamplePlan(brief: Brief, catalog: Film[] = defaultCatalog): Plan {
  const proposals = rankProposals({ brief, films:catalog, evidence:sampleEvidence(brief,catalog) });
  const warnings = ['Sample mode: all audience ranks are synthetic fixtures derived from seeds and the anchor, not Qloo evidence.', 'Screening rights must be verified with the rights holder before booking.'];
  if (proposals.length < 3) warnings.push(`Only ${proposals.length} eligible proposals. Constraints were not relaxed.`);
  const nyc = /^(new york( city)?|nyc)$/i.test(brief.city.trim());
  if (!nyc) warnings.push('Fictional partner prospects are shown only for New York.');
  return { mode:'sample', proposals, partners:nyc ? [
    { id:'fictional-print', name:'Frame & Fold (fictional)', kind:'Print studio prospect', address:'New York City, illustrative only', note:'Invented sample prospect. No real business, address or willingness to partner is implied.', source:'sample' },
    { id:'fictional-cafe', name:'Afterlight Coffee Room (fictional)', kind:'Cafe prospect', address:'New York City, illustrative only', note:'Invented sample prospect. No real business, address or willingness to partner is implied.', source:'sample' }
  ] : [], traces:[
    { tool:'plan', status:'ok', detail:'Deterministic bounded workflow: generate two synthetic lists, check constraints then rank at most three proposals. No LLM is used.' },
    { tool:'synthetic-ranks', status:'ok', detail:'Seed and anchor dependent hash ordering. Ordinal fixtures have no empirical audience interpretation.' },
    { tool:'constraint-check', status:proposals.length < 3 ? 'warning' : 'ok', detail:'Excluded titles, unavailable rights, self-pairing and total runtime are hard filters. Unverified rights remain a booking action.' },
    { tool:'replan', status:proposals.length < 3 ? 'warning' : 'ok', detail:proposals.length < 3 ? 'Returned a shorter list without inventing evidence or relaxing constraints.' : 'Three feasible proposals found. No replan needed.' }
  ], warnings, resolvedSeeds:[], generatedAt:new Date().toISOString() };
}
