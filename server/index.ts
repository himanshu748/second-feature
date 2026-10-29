import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { films as catalog } from '../src/lib/catalog';
import { ApiError, generateLivePlan, QlooClient } from './qloo';
import { planSchema, searchSchema } from './schema';

const MAX_BODY = 200_000;
function json(res:ServerResponse,status:number,payload:unknown):void {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(payload));
}
async function body(req:IncomingMessage):Promise<unknown> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'Use application/json.','unsupported_media_type');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new ApiError(413,'Request body is too large.','body_too_large');
  const chunks:Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY) throw new ApiError(413,'Request body is too large.','body_too_large');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400,'Request body must be valid JSON.','invalid_json'); }
}
const mime:Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.webp':'image/webp'};
async function serveStatic(pathname:string,res:ServerResponse,root:string):Promise<void> {
  let decoded:string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new ApiError(400,'Invalid URL encoding.','invalid_url'); }
  const target = resolve(root, '.' + decoded);
  if (target !== root && !target.startsWith(root+sep)) throw new ApiError(403,'Path is not allowed.','forbidden');
  let filename = target;
  try { if (!(await stat(filename)).isFile()) filename = resolve(root,'index.html'); }
  catch { filename = resolve(root,'index.html'); }
  try {
    const content = await readFile(filename);
    res.writeHead(200,{'Content-Type':mime[extname(filename)] ?? 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    res.end(content);
  } catch { throw new ApiError(404,'Frontend build not found. Run npm run build or use the Vite dev server.','not_found'); }
}
export function createAppServer(client = new QlooClient(), distRoot = fileURLToPath(new URL('../dist',import.meta.url))) {
  const root = resolve(distRoot);
  let activePlans = 0;
  const limits = new Map<string,{count:number;reset:number}>();
  const server = createServer(async(req,res)=>{
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      res.setHeader('Referrer-Policy','same-origin');
      res.setHeader('X-Frame-Options','SAMEORIGIN');
      if (url.pathname === '/api/search' || url.pathname === '/api/plan') {
        const key = `${req.socket.remoteAddress ?? 'unknown'}:${url.pathname}`;
        const now = Date.now(); let bucket = limits.get(key);
        if (!bucket || bucket.reset < now) { bucket={count:0,reset:now+60000}; if(limits.size>1000) limits.delete(limits.keys().next().value!); limits.set(key,bucket); }
        const max = url.pathname === '/api/plan' ? 6 : 40;
        if (++bucket.count > max) { res.setHeader('Retry-After','60'); throw new ApiError(429,'Workspace request limit reached. Try again in one minute.','rate_limited'); }
      }
      if (url.pathname === '/api/status' && req.method === 'GET') return json(res,200,{configured:client.configured});
      if (url.pathname === '/api/search' && req.method === 'GET') {
        const parsed = searchSchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) throw new ApiError(400,'Search requires a query of 1 to 180 characters and no extra parameters.','invalid_input');
        const candidates = await client.search(parsed.data.query);
        return json(res,200,{candidates:candidates.slice(0,20).map(e=>({id:e.id,name:e.name,types:e.types,...(e.year ? {year:e.year} : {}),...(e.address ? {address:e.address} : {})})),warnings:candidates.length ? [] : ['No search matches. Try a more specific name.']});
      }
      if (url.pathname === '/api/plan' && req.method === 'POST') {
        const parsed = planSchema.safeParse(await body(req));
        if (!parsed.success) return json(res,400,{error:'Invalid plan input.',code:'invalid_input',issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
        if (activePlans >= 2) throw new ApiError(429,'Two live programmes are already being built. Try again shortly.','busy');
        activePlans++;
        try { return json(res,200,await generateLivePlan(parsed.data.brief,parsed.data.films ?? catalog,client)); }
        finally { activePlans--; }
      }
      if (url.pathname.startsWith('/api/')) throw new ApiError(404,'API route or method not found.','not_found');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405,'Method not allowed.','method_not_allowed');
      await serveStatic(url.pathname,res,root);
    } catch(e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof ApiError) json(res,e.status,{error:e.message,code:e.code});
      else json(res,500,{error:'The server could not complete this request. No sample fallback was used.',code:'internal_error'});
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const server = createAppServer();
  server.listen(port,'0.0.0.0',()=>console.log(`Second Feature server listening on port ${port}.`));
}
