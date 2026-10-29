import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {briefSchema,filmSchema} from './schema';
import {films as catalog} from '../src/lib/catalog';
import {ApiError,QlooClient,generateLivePlan} from './qloo';

/** Agent-facing tool surface. The host agent supplies reasoning; this tool supplies grounded planning. */
export function createCinemaMcp(client=new QlooClient()){
 const server=new McpServer({name:'second-feature',version:'1.0.0'});
 server.registerTool('plan_cinema_program',{
   title:'Plan a culturally grounded cinema programme',
   description:'Resolve explicitly typed cultural seeds with Qloo, retrieve separate core and reach movie ranks, enforce film availability and runtime, make one bounded replan and return evidence plus local partnership prospects. Use type:name seed syntax such as artist:Nujabes or book:Kafka on the Shore. This tool does not book rights, send outreach or predict attendance. Its rationales are deterministic editorial rules, not LLM-generated insights. Re-call with an updated brief to replan.',
   inputSchema:{brief:briefSchema,films:z.array(filmSchema).min(1).max(40).optional()},
   annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:true}
 },async({brief,films})=>{
   const fs=films??catalog;
   if(new Set(fs.map(f=>f.id)).size!==fs.length)return {isError:true,content:[{type:'text' as const,text:'Catalog IDs must be unique.'}]};
   try{
     const plan=await generateLivePlan(brief,fs,client);
     return {content:[{type:'text' as const,text:JSON.stringify(plan)}],structuredContent:plan as unknown as Record<string,unknown>};
   }catch(e){return {isError:true,content:[{type:'text' as const,text:e instanceof ApiError?`${e.code}: ${e.message}`:'Programme planning failed. No sample fallback was used.'}]};}
 });
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createCinemaMcp();
 await server.connect(new StdioServerTransport());
}
