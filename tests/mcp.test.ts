import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createCinemaMcp} from '../server/mcp';
import {QlooClient} from '../server/qloo';
import {defaultBrief} from '../src/lib/catalog';
test('MCP agent tool is discoverable, validates arguments and fails closed without a key',async()=>{
 const server=createCinemaMcp(new QlooClient({apiKey:''}));
 const client=new Client({name:'test-agent',version:'1.0.0'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try{
  const {tools}=await client.listTools();assert.equal(tools[0].name,'plan_cinema_program');
  assert.equal(tools[0].annotations?.readOnlyHint,true);
  const result=await client.callTool({name:'plan_cinema_program',arguments:{brief:defaultBrief}});
  assert.equal(result.isError,true);assert.ok(JSON.stringify(result.content).includes('not_configured'));
  const invalid=await client.callTool({name:'plan_cinema_program',arguments:{brief:{...defaultBrief,maxMinutes:-1}}});
  assert.equal(invalid.isError,true);
 }finally{await client.close();await server.close();}
});
