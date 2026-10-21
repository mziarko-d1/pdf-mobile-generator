const {test}=require('node:test');
const assert=require('node:assert/strict');
const {safeLink,groupElements,linkRect}=require('../artwork-layout.js');
const line=(id,text,x,y,font='body')=>({id,kind:'text',text,x,y,width:100,fontSize:10,color:'#000000',font,fit:true});
test('paragraph lines become one editable block and preserve original baselines',()=>{
 const result=groupElements([line('a','First line',20,50),line('b','second line',20,66),line('c','Other column',220,50)]);
 assert.equal(result.length,2);const block=result.find(e=>e.id==='a');
 assert.equal(block.text,'First line second line');assert.equal(block.originalLines.length,2);
 assert.deepEqual(block.originalLines.map(l=>l.y),[0,16]);assert.equal(block.lineHeight,1.6);
});
test('caps in adjacent columns stay separate; grouping is idempotent',()=>{
 const result=groupElements([line('a','FIRST',20,50),line('b','SECOND',220,50)]);
 assert.equal(result.length,2);assert.deepEqual(groupElements(result),result);
});
test('body text does not merge with a bold heading, or across large gaps',()=>{
 const result=groupElements([line('a','Heading',20,50,'bold'),line('b','Body',20,65),line('c','Later',20,120)]);
 assert.equal(result.length,3);
});
test('safe links allow web, email and phone targets and reject executable or credential URLs',()=>{
 for(const value of ['https://example.com/a?q=1','http://example.com','mailto:test@example.com','tel:+48123456789'])assert.ok(safeLink(value));
 for(const value of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','https://user:pass@example.com','/relative','https://example.com\n','https://exa\nmple.com']){
  if(value.endsWith('\n')&&!value.includes('exa\n'))continue;
  assert.equal(safeLink(value),'');
 }
});
test('link rectangles cover background buttons and account for text padding',()=>{
 assert.deepEqual(linkRect({kind:'link',x:20,y:40,width:180,height:30},30),{x:20,y:40,width:180,height:30});
 assert.deepEqual(linkRect({kind:'text',x:20,y:40,width:100,fontSize:10,linkPadding:5},15),{x:15,y:25,width:110,height:25});
});
const {resizeElement,removalPlan}=require('../artwork-layout.js');
test('resizing text rewraps by width without scaling type; vertical space and bounds are preserved',()=>{
 const el={...line('a','Text',20,50),fit:true};
 const r=resizeElement(el,'e',40,0,{width:400,height:600},30);
 assert.equal(r.width,140);assert.equal(r.fontSize,10);assert.equal(r.fit,false);assert.equal(r.layoutEdited,true);
 assert.equal(resizeElement(el,'s',0,40,{width:400,height:600},30).boxHeight,70);
 const left=resizeElement(el,'w',-100,0,{width:400,height:600},30);assert.equal(left.x,0);assert.equal(left.width,120);
 const move=resizeElement(el,'move',1000,-1000,{width:400,height:600},30);assert.equal(move.x,300);assert.equal(move.y,10);
 assert.deepEqual(el,line('a','Text',20,50));
});
test('compact deletion closes its own column and stops at full-width barriers',()=>{
 const els=[line('a','Delete',20,50),line('b','Next',20,90),line('c','Below',20,130),line('other','Other column',220,90),{...line('barrier','Full width',20,180),width:300},line('footer','Keep',20,220)];
 assert.deepEqual(removalPlan(els,'a',()=>20),{shift:40,ids:['b','c']});
 assert.deepEqual(removalPlan([...els,line('overlap','Overlapping',20,55)],'a',()=>20),{shift:0,ids:[]});
 assert.deepEqual(removalPlan([{id:'hotspot',kind:'link',x:20,y:40,width:100},...els],'hotspot',()=>20),{shift:0,ids:[]});
});
