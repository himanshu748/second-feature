import { z } from 'zod';
const id = z.string().trim().min(1).max(80);
const text = (max:number) => z.string().trim().min(1).max(max);
export const filmSchema = z.object({
  id, title:text(180), year:z.number().int().min(1880).max(2100), director:text(180),
  minutes:z.number().int().min(1).max(600), country:text(120),
  palette:z.tuple([z.string().regex(/^#[0-9a-fA-F]{6}$/),z.string().regex(/^#[0-9a-fA-F]{6}$/),z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
  motif:z.enum(['city','sun','stairs','moon','road','waves']), themes:z.array(text(60)).max(16), note:text(1000), rights:z.enum(['unverified','confirmed','unavailable'])
}).strict();
export const briefSchema = z.object({
  anchorId:id, coreSeeds:z.array(text(120)).min(1).max(6), reachSeeds:z.array(text(120)).min(1).max(6),
  maxMinutes:z.number().int().min(60).max(720), intervalMinutes:z.number().int().min(0).max(120),
  excludedIds:z.array(id).max(40), strategy:z.enum(['core','bridge','discovery']), city:text(100),
  startsAt:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
}).strict();
export const planSchema = z.object({brief:briefSchema, films:z.array(filmSchema).min(1).max(40).optional()}).strict().superRefine((v,ctx)=>{
  if (v.films && new Set(v.films.map(f=>f.id)).size !== v.films.length) ctx.addIssue({code:'custom',path:['films'],message:'Catalog IDs must be unique.'});
  if (v.films && !v.films.some(f=>f.id === v.brief.anchorId)) ctx.addIssue({code:'custom',path:['brief','anchorId'],message:'Anchor must be in the catalog.'});
});
export const searchSchema = z.object({query:text(180)}).strict();
