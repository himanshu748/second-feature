export type Strategy = 'core' | 'bridge' | 'discovery';
export type Mode = 'sample' | 'live';
export interface Film { id:string; title:string; year:number; director:string; minutes:number; country:string; palette:[string,string,string]; motif:'city'|'sun'|'stairs'|'moon'|'road'|'waves'; themes:string[]; note:string; rights:'unverified'|'confirmed'|'unavailable'; }
export interface Brief { anchorId:string; coreSeeds:string[]; reachSeeds:string[]; maxMinutes:number; intervalMinutes:number; excludedIds:string[]; strategy:Strategy; city:string; startsAt:string; }
export interface Evidence { filmId:string; entityId?:string; coreRank:number|null; reachRank:number|null; source:Mode; }
export interface Proposal { film:Film; score:number; evidence:Evidence; totalMinutes:number; interpretation:string; }
export interface Partner { id:string; name:string; kind:string; address:string; note:string; entityId?:string; source:Mode; }
export interface Trace { tool:string; status:'ok'|'warning'; detail:string; }
export interface Plan { mode:Mode; proposals:Proposal[]; partners:Partner[]; traces:Trace[]; warnings:string[]; resolvedSeeds:{name:string;id:string;audience:'core'|'reach'}[]; generatedAt:string; }
export interface RankInput { brief:Brief; films:Film[]; evidence:Evidence[]; }
