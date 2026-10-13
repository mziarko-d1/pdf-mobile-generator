const {test}=require('node:test');
const assert=require('node:assert/strict');
const AI=require('../smart-import.js');
const fixture=()=>({title:'Materiał',groups:[{heading:'Codzienna praktyka',blocks:[{id:'a',type:'paragraph',title:'',body:'Zapisuj wyniki w dzienniczku.',suggestedBox:'warning'},{id:'b',type:'paragraph',title:'',body:'Opis metody.'}]},{kind:'sources',heading:'Źródła',blocks:[{id:'ref',type:'paragraph',body:'Bibliografia'}]}]});
const input=()=>AI.requestFor(fixture(),'patient');
const output=()=>({classifications:[{id:'a',label:'remember'},{id:'b',label:'none'}]});
test('semantic classifications apply automatically without rewriting source text or references',()=>{
  const parsed=fixture(),before=parsed.groups.flatMap(g=>g.blocks.map(b=>b.body));
  assert.equal(AI.apply(parsed,input(),output()),1);
  assert.equal(parsed.groups[0].blocks[0].type,'remember');
  assert.equal(parsed.groups[0].blocks[1].type,'paragraph');
  assert.equal(parsed.groups[0].blocks[0].suggestedBox,undefined);
  assert.equal(parsed.groups[1].blocks[0].aiClassification,undefined);
  assert.deepEqual(parsed.groups.flatMap(g=>g.blocks.map(b=>b.body)),before);
});
test('invalid, duplicate, missing and hallucinated decisions never partly change the input',()=>{
  for(const bad of [{classifications:[{id:'a',label:'warning'}]},{classifications:[{id:'a',label:'warning'},{id:'a',label:'none'}]},{classifications:[{id:'a',label:'warning'},{id:'invented',label:'none'}]},{classifications:[{id:'a',label:'warning'},{id:'b',label:'execute'}]}]){
    const parsed=fixture(),before=JSON.stringify(parsed);
    assert.throws(()=>AI.apply(parsed,input(),bad));
    assert.equal(JSON.stringify(parsed),before);
  }
});
test('provider failure preserves parsed document',async()=>{
  const parsed=fixture(),before=JSON.stringify(parsed);
  await assert.rejects(AI.analyze(parsed,'patient',async()=>{throw Error('offline');}));
  assert.equal(JSON.stringify(parsed),before);
});
test('backend validates audience, unique ids, lengths and complete model output',async()=>{
  const {validateInput,validateOutput}=await import('../ai-service/lib/classifier.mjs');
  assert.equal(validateInput(input()).audience,'patient');
  assert.equal(validateInput({...input(),extra:'ignore'}).extra,undefined);
  for(const data of [{...input(),audience:'other'},{...input(),blocks:[...input().blocks,input().blocks[0]]},{...input(),blocks:[{...input().blocks[0],body:'x'.repeat(6001)}]}]) assert.throws(()=>validateInput(data));
  assert.throws(()=>validateOutput(input(),{classifications:[]}));
});
test('large documents are analyzed in bounded batches and every fragment is checked',async()=>{
  const {classify}=await import('../ai-service/lib/classifier.mjs');
  const data={...input(),blocks:Array.from({length:65},(_,i)=>({...input().blocks[0],id:'b'+i}))};
  const sizes=[];
  const result=await classify(data,async batch=>{sizes.push(batch.blocks.length);return {classifications:batch.blocks.map(b=>({id:b.id,label:'none'}))};});
  assert.deepEqual(sizes,[30,30,5]);assert.equal(result.classifications.length,65);
});
async function call({origin='https://mziarko-d1.github.io',method='POST',auth='Bearer gho_example',login='mziarko-d1',ok=true,fail=false,body=input()}={}){
  const {createHandler}=await import('../ai-service/api/analyze.mjs');
  let aiCalls=0,githubCalls=0;
  const handler=createHandler({fetchUser:async()=>{githubCalls++;return {ok,json:async()=>({login})};},analyze:async()=>{aiCalls++;if(fail)throw Error('provider-secret');return output();}});
  const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;},end(){return this;}};
  await handler({method,headers:{origin,authorization:auth},body},response);
  return {...response,aiCalls,githubCalls};
}
test('paid API rejects foreign origins, missing authentication and other GitHub accounts before model call',async()=>{
  for(const args of [{origin:'https://evil.example'},{auth:''},{login:'someone-else'},{ok:false}]){
    const result=await call(args);assert.ok([401,403].includes(result.code));assert.equal(result.aiCalls,0);
  }
});
test('preflight, bad payload and service failure return safe responses',async()=>{
  const pre=await call({method:'OPTIONS',auth:''});assert.equal(pre.code,204);assert.equal(pre.githubCalls,0);
  assert.equal((await call({body:{}})).code,400);
  const result=await call({fail:true});assert.equal(result.code,503);assert.ok(!JSON.stringify(result).includes('provider-secret'));
});
test('authenticated owner receives validated analysis with no caching',async()=>{
  const result=await call();assert.equal(result.code,200);assert.deepEqual(result.body,output());assert.equal(result.aiCalls,1);assert.equal(result.headers['Cache-Control'],'no-store');
});
