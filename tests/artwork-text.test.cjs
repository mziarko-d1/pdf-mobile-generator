const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyStyle,remapStyles,runs,originalOffsets,sourceStyles}=require('../artwork-text.js');
test('selection styles overlap independently, toggle and clear without changing surrounding text',()=>{
 const text='Alpha beta gamma';
 let styles=applyStyle(text,[],6,10,{bold:true});
 styles=applyStyle(text,styles,8,16,{color:'#AA0000'});
 assert.deepEqual(styles,[{start:6,end:8,bold:true},{start:8,end:10,bold:true,color:'#aa0000'},{start:10,end:16,color:'#aa0000'}]);
 styles=applyStyle(text,styles,6,10,{bold:null});
 assert.deepEqual(styles,[{start:8,end:16,color:'#aa0000'}]);
 styles=applyStyle(text,styles,0,text.length,{color:null});assert.deepEqual(styles,[]);
});
test('edits preserve unaffected ranges and inherit styles inside a selected word',()=>{
 const before='Alpha beta gamma',style=[{start:6,end:10,bold:true}];
 assert.deepEqual(remapStyles(before,'New '+before,style),[{start:10,end:14,bold:true}]);
 assert.deepEqual(remapStyles(before,'Alpha brilliant gamma',style),[{start:6,end:15,bold:true}]);
 assert.deepEqual(remapStyles(before,'Alpha gamma',style),[]);
 assert.deepEqual(remapStyles(before,'',style),[]);
});
test('Unicode selections are safe and untrusted formatting cannot inject SVG attributes',()=>{
 const text='A😀 żółć';
 const styles=applyStyle(text,[],2,3,{bold:true,color:'red" onload="x',font:'bad"font'});
 assert.deepEqual(styles,[{start:1,end:3,bold:true}]);
 assert.equal(runs(text,styles).map(r=>r.text).join(''),text);
 assert.deepEqual(runs(text,styles).find(r=>r.text==='😀').style,{bold:true});
});
test('source positions map normalized paragraphs, inline runs and soft hyphens',()=>{
 const el={text:'This is a paragraph.',originalLines:[{text:'This ',font:'regular',color:'#000000'},{text:'is a para-',font:'bold',color:'#000000'},{text:'graph.',font:'regular',color:'#000000'}]};
 assert.deepEqual(originalOffsets(el),[[0,1,2,3,4],[5,6,7,8,9,10,11,12,13,-1],[14,15,16,17,18,19]]);
 assert.ok(sourceStyles(el).some(r=>r.font==='bold'&&r.start===5&&r.end===14));
 assert.equal(originalOffsets({...el,text:'Changed text'}),null);
});
