'use strict';
const assert=require('node:assert/strict');
const bridge=require('./bridge.js');
let n=0;
function test(name,cb){cb();console.log('✓ '+name);n++;}
function fixture(){
 const event={id:'e',ddl:'2026-12-30',name:'活动'};
 const product={id:'p',title:'文稿',eventId:'e',type:'novel',handoffBufferDays:1,
 tracks:[{id:'main',name:'正文',owner:'主催',isMine:true,steps:[
 {id:'outline',name:'大纲',kind:'fixed',days:2,completed:false},
 {id:'text',name:'正文',kind:'quantity',total:12000,done:1000,unit:'字',unitMinutes:0.08,completed:false}]}],
 shared:[{id:'sample',name:'打样',kind:'external',days:5},{id:'big',name:'大货生产',kind:'external',days:7},{id:'ship',name:'运输',purpose:'shipping',kind:'external',days:3}]};
 return {product,event,logs:[],today:'2026-12-01'};
}
test('01 all original state remains unchanged',()=>{const f=fixture(),before=JSON.stringify(f);bridge.compute(f);assert.equal(JSON.stringify(f),before)});
test('02 DDL and dispatch correct',()=>{const a=bridge.compute(fixture());assert.equal(a.plan.latestDispatch,'2026-12-27');assert.equal(a.plan.latestProductReady,'2026-12-26')});
test('03 all stages preserved as DAG',()=>{const a=bridge.compute(fixture());assert.deepEqual(a.input.steps.find(s=>s.id==='sample').predecessors,['text']);assert.equal(a.plan.rows.big.latestFinish,'2026-12-26')});
test('04 no hours preset yields provisional duration',()=>{const a=bridge.compute(fixture());assert.ok(a.warnings.some(x=>x.type==='auto_duration'));assert.equal(a.plan.rows.text.latestProvisional,true)});
test('05 explicit quantity days not provisional',()=>{const f=fixture();f.product.tracks[0].steps[1].plannedDays=6;const a=bridge.compute(f);assert.equal(a.input.steps.find(x=>x.id==='text').days,6);assert.ok(!a.warnings.some(x=>x.type==='auto_duration'))});
test('06 receipt last date unchanged after shipment',()=>{const f=fixture(),before=bridge.compute(f);f.product.shared.at(-1).completed=true;f.product.shared.at(-1).completedAt='2026-12-27';const after=bridge.compute(f);assert.equal(before.plan.rows.big.latestFinish,after.plan.rows.big.latestFinish)});
test('07 promise later than latest retained and reported',()=>{const f=fixture();f.product.tracks[0].steps[1].promisedDelivery='2026-12-25';const a=bridge.compute(f);assert.ok(a.plan.diagnostics.some(x=>x.type==='promise_after_latest'));assert.equal(f.product.tracks[0].steps[1].promisedDelivery,'2026-12-25')});
test('08 baseline freeze and forecast varies with today',()=>{const f=fixture(),snapshot=bridge.baselineFor(f.product,f.event,[],'2026-12-01');const late=bridge.compute({...f,today:'2026-12-15'});assert.equal(snapshot.dates.text.latestFinish,late.plan.rows.text.latestFinish);assert.equal(snapshot.anchorDay,'2026-12-01')});
test('09 completed unknown stays unknown',()=>{const f=fixture();f.product.tracks[0].steps[0].completed=true;const a=bridge.compute(f);assert.equal(a.plan.rows.outline.actualFinished,null);assert.equal(a.plan.rows.text.forecastConfidence,'blocked')});
test('10 different routes merge only at production',()=>{const f=fixture();f.product.tracks.push({id:'cover',name:'封面',owner:'画师',steps:[{id:'art',name:'成图',kind:'external',days:5}]});const a=bridge.compute(f);assert.deepEqual(a.input.steps.find(x=>x.id==='sample').predecessors.sort(),['art','text'])});
test('11 bad shipping order not auto-guessed',()=>{const f=fixture();f.product.shared.reverse();assert.throws(()=>bridge.compute(f),/运输工序/)});
test('12 actual progress remains original on repeated reads',()=>{const f=fixture();f.logs.push({id:'log1',productId:'p',stepId:'text',date:'2026-12-01',amount:500});let a=bridge.compute(f),b=bridge.compute(f);assert.deepEqual(a.plan.order,b.plan.order);assert.equal(f.logs[0].amount,500)});
console.log(n+'/'+n+' bridge tests passed');
