(function(root){
  'use strict';
  const labels=['none','important','remember','warning'];
  function requestFor(parsed,role){
    const blocks=[];
    (parsed.groups||[]).forEach(group=>{
      if(group.kind==='sources') return;
      (group.blocks||[]).forEach(block=>{
        if(['paragraph','bullets','numbered'].includes(block.type)){
          blocks.push({id:block.id,section:group.heading||'',title:block.title||'',body:block.body||''});
        }
      });
    });
    return {title:parsed.title||'',audience:role,blocks};
  }
  // Validate the whole response before changing even one block.
  function apply(parsed,request,result){
    if(!result||!Array.isArray(result.classifications)) throw new Error('AI zwróciło niepoprawną analizę.');
    const expected=new Set(request.blocks.map(b=>b.id));
    const decisions=new Map();
    result.classifications.forEach(item=>{
      if(!item||!expected.has(item.id)||decisions.has(item.id)||!labels.includes(item.label)){
        throw new Error('AI zwróciło niepoprawną analizę.');
      }
      decisions.set(item.id,item.label);
    });
    if(decisions.size!==expected.size) throw new Error('AI nie przeanalizowało całej treści. Spróbuj ponownie.');
    let count=0;
    (parsed.groups||[]).forEach(group=>{
      delete group.suggestedBox;
      (group.blocks||[]).forEach(block=>{
        if(!decisions.has(block.id)) return;
        delete block.suggestedBox;
        block.aiClassification=decisions.get(block.id);
        if(block.aiClassification!=='none'){
          block.type=block.aiClassification;
          count++;
        }
      });
    });
    return count;
  }
  async function analyze(parsed,role,client){
    const request=requestFor(parsed,role);
    if(!request.blocks.length) return 0;
    const result=await client(request);
    return apply(parsed,request,result);
  }
  const api={requestFor,apply,analyze};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.PdfImportAI=api;
})(typeof window==='undefined'?globalThis:window);
