/* 纸上赶稿 v0.4 - bridge from v0.3.1 data to P0 dual-pass schedule.
   Pure, read-only: estimates flexible durations without mutating source records. */
(function(root,build){
 const api=build(typeof module==='object'&&module.exports?require('./scheduler.js'):root.FandomSchedulerP0,
                 typeof module==='object'&&module.exports?require('./legacy_adapter.js'):root.FandomLegacyAdapterP0);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FandomP0Bridge=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(core,adapter){
 'use strict';
 function compute({product,event,logs=[],today}){
   const copy=JSON.parse(JSON.stringify(product));
   // For an active revision, forecast against the latest promised redo date; source promise/history remains unchanged.
   for(const st of [...(copy.tracks||[]).flatMap(t=>t.steps||[]),...(copy.shared||[])]){const rev=Array.isArray(st.revisions)?st.revisions.at(-1):null;if(rev?.dueDate&&!st.completed)st.promisedDelivery=rev.dueDate;}
   const reminders=[];
   const prod=copy.shared||[];
   const ship=prod.at(-1);
   const isShip=ship&&(ship.purpose==='shipping'||/^(运输|快递运输|物流运输)$/.test(ship.name||''));
   const transit=isShip?Math.max(0,Math.round(+ship.days||0)):0;
   const buffer=Number.isInteger(copy.handoffBufferDays)?copy.handoffBufferDays:1;
   const end=core.addDate(event.ddl,-transit-buffer);
   const productionDays=prod.filter(s=>s!==ship||!isShip).reduce((n,s)=>n+Math.max(1,Math.ceil(+s.days||1)),0);
   const contentDue=core.addDate(end,-productionDays);
   for(const track of copy.tracks||[]){
     const incomplete=(track.steps||[]).filter(s=>!s.completed);
     const quantities=incomplete.filter(s=>s.kind==='quantity'&&!Number.isInteger(s.plannedDays));
     const rest=incomplete.filter(s=>s.kind!=='quantity'||Number.isInteger(s.plannedDays))
       .reduce((n,s)=>n+Math.max(1,Math.ceil(+(s.kind==='quantity'?s.plannedDays:s.days)||1)),0);
     const usable=Math.max(1,core.daysBetween(today,contentDue)+1-rest);
     const pool=quantities.map(s=>({s, weight:Math.max(1,(Math.max(0,(+s.total||0)-(+s.done||0)))*Math.max(0.01,(+s.unitMinutes||1)))}));
     const weightSum=pool.reduce((n,x)=>n+x.weight,0);
     let remainingDays=Math.max(pool.length,usable);
     const fractions=pool.map(x=>remainingDays*x.weight/weightSum);
     const assigned=pool.map((x,i)=>Math.max(1,Math.floor(fractions[i])));
     let remainder=Math.max(0,remainingDays-assigned.reduce((a,b)=>a+b,0));
     const sorted=pool.map((_,i)=>i).sort((a,b)=>(fractions[b]-Math.floor(fractions[b]))-(fractions[a]-Math.floor(fractions[a])));
     for(let j=0;j<remainder;j++) assigned[sorted[j%sorted.length]]++;
     pool.forEach(({s},i)=>{s.plannedDays=assigned[i];reminders.push({type:'auto_duration',stepId:s.id,days:assigned[i],message:'缺少人工预计工期：用当前剩余时间临时分配，不作为确定工期'});});
   }
   const converted=adapter.migratePreview({product:copy,event,logs,today});
   for(const x of reminders){const row=converted.input.steps.find(s=>s.id===x.stepId);if(row)row.durationProvisional=true;converted.warnings.push(x);}
   const result=core.plan(converted.input);
   return {input:converted.input,meta:converted.meta,warnings:converted.warnings,plan:result,contentDue};
 }
 function baselineFor(product,event,logs,today){
   const result=compute({product,event,logs,today});
   const dates={};for(const id of result.plan.order)dates[id]={latestStart:result.plan.rows[id].latestStart,latestFinish:result.plan.rows[id].latestFinish};
   return {version:1,createdAt:new Date().toISOString(),anchorDay:today,eventDDL:event.ddl,latestDispatch:result.plan.latestDispatch,dates,
     hasProvisional:result.warnings.some(w=>w.type==='auto_duration'||w.type==='quantity_duration_unknown')};
 }
 return Object.freeze({compute,baselineFor});
});
