(function(root){
  'use strict';
  function safeLink(value){
    const text=String(value||'').trim();
    if(!text||/[\u0000-\u001f\u007f]/.test(text))return '';
    try{
      const url=new URL(text);
      if(['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password)return url.href;
      if(['mailto:','tel:'].includes(url.protocol)&&url.pathname)return url.href;
    }catch{}
    return '';
  }
  function groupElements(elements){
    const result=elements.filter(e=>e.kind!=='text'||e.originalLines?.length).map(e=>({...e}));
    const lines=elements.filter(e=>e.kind==='text'&&!e.originalLines?.length).map(e=>({...e})).sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows=[];
    for(const el of lines){
      const prev=rows.at(-1);
      if(prev&&Math.abs(prev.y-el.y)<.3&&Math.abs(prev.fontSize-el.fontSize)<.15&&el.x-prev.right>=-.5&&el.x-prev.right<=Math.max(3,el.fontSize*.8)){
        prev.parts.push(el);prev.right=Math.max(prev.right,el.x+el.width);
      }else rows.push({x:el.x,y:el.y,right:el.x+el.width,fontSize:el.fontSize,parts:[el]});
    }
    const primary=row=>row.parts.reduce((a,b)=>a.text.length>b.text.length?a:b);
    const groups=[];
    for(const row of rows){
      const candidates=groups.filter(g=>{
        const last=g.at(-1),gap=row.y-last.y,fs=row.fontSize;
        return Math.abs(row.x-last.x)<Math.max(1.5,fs*.15)&&Math.abs(fs-last.fontSize)<.15&&gap>=fs*1.05&&gap<=fs*2.25&&(primary(last).font===primary(row).font||fs>=14)&&primary(last).color===primary(row).color;
      });
      candidates.sort((a,b)=>b.at(-1).y-a.at(-1).y);
      if(candidates.length)candidates[0].push(row);else groups.push([row]);
    }
    for(const rows of groups){
      const pieces=rows.flatMap(r=>r.parts),first=pieces[0];
      const base=pieces.reduce((a,b)=>pieces.filter(p=>p.font===a.font).reduce((n,p)=>n+p.text.length,0)>=pieces.filter(p=>p.font===b.font).reduce((n,p)=>n+p.text.length,0)?a:b);
      const text=rows.map(r=>r.parts.map(p=>p.text).join('').trim()).join(' ').replace(/(?<=\p{L})- (?=\p{Ll})/gu,'');
      result.push({...base,id:first.id,x:rows[0].x,y:rows[0].y,width:Math.max(...rows.map(r=>r.right))-rows[0].x,text,originalText:text,fit:false,
        lineHeight:rows.length>1?(rows[1].y-rows[0].y)/base.fontSize:base.lineHeight||1.5,
        originalLines:pieces.map(p=>({...p,x:p.x-rows[0].x,y:p.y-rows[0].y}))});
    }
    return result.sort((a,b)=>a.y-b.y||a.x-b.x);
  }
  function linkRect(element,height){
    const box=element.linkBox;
    if(box)return {x:element.x+Number(box.x||0),y:element.y+Number(box.y||0),width:Number(box.width),height:Number(box.height)};
    const padding=Math.max(0,Math.min(100,Number(element.linkPadding)||0));
    return {x:element.x-padding,y:element.y-(element.kind==='text'?Number(element.fontSize)||12:0)-padding,width:Number(element.width)+padding*2,height:Number(height)+padding*2};
  }
  const api={safeLink,groupElements,linkRect};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ArtworkLayout=api;
})(typeof window==='undefined'?globalThis:window);
