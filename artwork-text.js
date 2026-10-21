(function(root){
  'use strict';
  // Offsets use UTF-16, like textarea selections and String.slice.
  function clean(style){
    const out={};
    if(typeof style?.bold==='boolean')out.bold=style.bold;
    if(/^#[a-f\d]{6}$/i.test(style?.color||''))out.color=style.color.toLowerCase();
    if(typeof style?.font==='string'&&/^[a-z\d_]*$/i.test(style.font))out.font=style.font;
    return out;
  }
  function cells(text,ranges){
    const out=Array.from({length:text.length},()=>({}));
    for(const range of ranges||[]){
      const style=clean(range),start=Math.max(0,Math.min(text.length,Math.trunc(Number(range.start)||0))),end=Math.max(start,Math.min(text.length,Math.trunc(Number(range.end)||0)));
      for(let i=start;i<end;i++)Object.assign(out[i],style);
    }
    return out;
  }
  function pack(values){
    const out=[];let last='';
    values.forEach((style,i)=>{
      const key=JSON.stringify(style);
      if(key!==last){if(Object.keys(style).length)out.push({start:i,end:i+1,...style});last=key;}
      else if(Object.keys(style).length)out.at(-1).end=i+1;
    });
    return out;
  }
  function applyStyle(text,ranges,start,end,patch){
    const values=cells(text,ranges);
    start=Math.max(0,Math.min(text.length,start));end=Math.max(start,Math.min(text.length,end));
    if(start&&/[\uDC00-\uDFFF]/.test(text[start]||''))start--;
    if(end<text.length&&/[\uDC00-\uDFFF]/.test(text[end]||''))end++;
    const safe=clean(patch);
    for(let i=start;i<end;i++){
      for(const key of ['bold','color','font'])if(patch[key]===null)delete values[i][key];
      Object.assign(values[i],safe);
    }
    return pack(values);
  }
  function remapStyles(before,after,ranges){
    if(before===after)return pack(cells(before,ranges));
    let start=0,end=0;
    while(start<before.length&&start<after.length&&before[start]===after[start])start++;
    while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
    const old=cells(before,ranges),replaced=before.length-start-end;
    const inherited=old[replaced?start:Math.max(0,start-1)]||{};
    return pack([...old.slice(0,start),...Array.from({length:after.length-start-end},()=>({...inherited})),...old.slice(before.length-end)]);
  }
  function runs(text,ranges){
    const values=cells(text,ranges),out=[];let offset=0;
    for(const char of text){
      const style=values[offset]||{},key=JSON.stringify(style),last=out.at(-1);
      if(last&&last.key===key){last.text+=char;last.end+=char.length;}
      else out.push({start:offset,end:offset+char.length,text:char,style,key});
      offset+=char.length;
    }
    return out;
  }
  function originalOffsets(element){
    const text=String(element.text||'');let cursor=0;const out=[];
    for(const line of element.originalLines||[]){
      const offsets=[];
      for(const char of line.text){
        if(/\s/u.test(char)){
          if(/\s/u.test(text[cursor]||'')){offsets.push(cursor);cursor++;}else offsets.push(-1);
          continue;
        }
        while(/\s/u.test(text[cursor]||''))cursor++;
        if(text.startsWith(char,cursor)){offsets.push(cursor);cursor+=char.length;}
        else if(char==='-')offsets.push(-1); // Source soft hyphen removed in paragraph text.
        else return null;
      }
      out.push(offsets);
    }
    return cursor===text.trimEnd().length?out:null;
  }
  function sourceStyles(element){
    const offsets=originalOffsets(element);if(!offsets)return [];
    const values=Array.from({length:element.text.length},()=>({}));
    element.originalLines.forEach((line,i)=>{
      [...line.text].forEach((char,j)=>{
        const offset=offsets[i][j];if(offset<0)return;
        const style=clean({font:line.font,color:line.color});
        for(let k=offset;k<offset+char.length;k++)values[k]=style;
      });
    });
    return pack(values);
  }
  const api={applyStyle,remapStyles,runs,originalOffsets,sourceStyles,cells};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ArtworkText=api;
})(typeof window==='undefined'?globalThis:window);
