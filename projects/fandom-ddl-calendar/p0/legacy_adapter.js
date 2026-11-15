/* Read-only adapter: v0.3.1 localStorage JSON -> proposed P0 DAG.
   No guessed completion timestamps and no automatic migration/write-back. */
(function(root, build) {
  const core = typeof module === 'object' && module.exports ? require('./scheduler.js') : root.FandomSchedulerP0;
  const api = build(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FandomLegacyAdapterP0 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(core) {
  'use strict';
  if (!core) throw new Error('需要先载入 scheduler.js');
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && (()=>{try{core.daysBetween(value,value);return true;}catch{return false;}})();
  const shippingStep = s => s?.purpose === 'shipping' || (s?.kind === 'external' && /^(运输|快递运输|物流运输)$/.test(s.name || ''));
  function migratePreview({product, event, logs = [], today}) {
    if (!product || !event || !validDate(event.ddl)) throw new Error('制品必须关联含有效收货 DDL 的活动');
    if (!Array.isArray(product.tracks) || !Array.isArray(product.shared)) throw new Error('旧版制品结构不完整');
    const warnings = [], meta = Object.create(null), steps = [];
    const allLogs = logs.filter(l => l.productId === product.id);
    const production = product.shared.slice();
    const shipIndices = production.map((s,i)=>shippingStep(s)?i:-1).filter(i=>i>=0);
    let ship = null;
    if (shipIndices.length === 1 && shipIndices[0] === production.length-1) {
      ship = production.pop();
    } else if (shipIndices.length) {
      throw new Error('运输工序需要恰好一条且为下印流程末项；请人工修复，不能自动猜');
    } else warnings.push({type:'missing_shipping',message:'旧数据未提供运输工序；暂按运输 0 天演示，必须由主催确认。'});
    const transit = ship ? Math.max(0, Math.round(Number(ship.days)||0)) : 0;
    const buffer = Number.isInteger(product.handoffBufferDays) && product.handoffBufferDays>=0 ? product.handoffBufferDays : 1;
    if (product.handoffBufferDays === undefined) warnings.push({type:'inferred_buffer',message:'旧版采用隐含交接缓冲；此处暂按 1 天演示，正式迁移须确认。'});

    const completionFor = (s) => {
      const related = allLogs.filter(l=>l.stepId===s.id && !l.deleted && !l.voided).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      const isPiece = !!s.pieceStage && Array.isArray(product.pieces);
      const initial = Number(s.done)||0;
      const written = related.reduce((sum,l)=>sum+(Number(l.amount)||0),0);
      const finishedCount = isPiece ? product.pieces.filter(piece=>!!piece[s.pieceStage]).length : Math.max(0,initial+written);
      const completed = !!s.completed || (s.kind==='quantity' && Number(s.total)>0 && finishedCount >= Number(s.total));
      let at = validDate(s.completedAt) ? s.completedAt : null;
      if (!at && s.completedAt) warnings.push({type:'bad_completion_date',stepId:s.id,message:'旧环节实际完成日无效，不会采用'});
      if (!at && !isPiece) {
        const marked = related.filter(l=>l.completedByLog && validDate(l.date));
        if (marked.length) at=marked[marked.length-1].date;
      }
      // Quantity completion from persisted logs is inferable only if initialDone is below goal
      // and valid logs can prove the threshold-crossing date. Never infer from piece booleans.
      if (!at && !isPiece && completed && s.kind === 'quantity' && initial < Number(s.total)) {
        let count = initial;
        for(const log of related){count += Number(log.amount)||0;if(count>=Number(s.total)&&validDate(log.date)){at=log.date;break;}}
      }
      if (completed && !at) warnings.push({type:'unknown_actual',stepId:s.id,message:'工序标记完成但无法证明实际完成日期；保留为未知'});
      return {completed,actualFinished:completed?at:null,finishedCount};
    };
    const addStep=(s,predecessors,area,track)=>{
      if(!s.id || meta[s.id])throw new Error('工序 ID 无效或重复: '+s.id);
      const c=completionFor(s);
      // An unconfigured quantity workload MUST NOT imply it can truly finish in one day.
      // The one-day placeholder is explicitly marked provisional and never treated as a reliable ETA.
      const duration = s.kind==='quantity'
        ? (Number.isInteger(s.plannedDays) && s.plannedDays>=1 ? s.plannedDays : 1)
        : Math.max(1, Math.ceil(Number(s.days)||1));
      const durationProvisional = s.kind==='quantity' && !(Number.isInteger(s.plannedDays) && s.plannedDays>=1);
      if(durationProvisional)warnings.push({type:'quantity_duration_unknown',stepId:s.id,message:'旧数据缺少稳定的数量型工期；先用一日技术占位，禁止直接作为可靠预测'});
      steps.push({id:s.id,days:duration,predecessors:[...predecessors],completed:c.completed,
        actualFinished:c.actualFinished, promisedDelivery:validDate(s.promisedDelivery)?s.promisedDelivery:null,
        dueBy:validDate(s.dueBy)?s.dueBy:null,durationProvisional});
      meta[s.id]={productId:product.id,stepName:s.name,area,trackId:track?.id||null,
        owner:track?.owner||null,isMine:typeof s.isMine==='boolean'?s.isMine:(typeof track?.isMine==='boolean'?track.isMine:track?.owner==='主催'),
        durationProvisional,originalKind:s.kind,completed:c.completed,completedCount:c.finishedCount,
        target:Number(s.total)||0};
    };
    const ends = [];
    for(const track of product.tracks){
      let predecessor=[];
      for(const s of (track.steps||[])){
        addStep(s,predecessor,'track',track);predecessor=[s.id];
      }
      if(predecessor.length)ends.push(predecessor[0]);
    }
    let predecessor=ends;
    for(const s of production){addStep(s,predecessor,'production',null);predecessor=[s.id];}
    if(!production.length && !ends.length)warnings.push({type:'no_steps',message:'制品没有任何工序，无法推算创作时间'});
    const shipLogs = ship ? allLogs.filter(l=>l.stepId===ship.id && l.completedByLog && validDate(l.date)) : [];
    const actualDispatch = ship && validDate(ship.completedAt) ? ship.completedAt
      : shipLogs.length ? shipLogs.sort((a,b)=>a.date.localeCompare(b.date)).at(-1).date:null;
    if (ship?.completed && !actualDispatch) warnings.push({type:'unknown_dispatch_date',message:'旧版标记为已寄出，但缺少实际寄出日期'});
    const input={today,receiptDeadline:event.ddl,transitDays:transit,handoffBufferDays:buffer,
      steps,actualDispatch,actualReceipt:validDate(product.actualReceipt)?product.actualReceipt:null};
    return {input,meta,warnings};
  }
  function previewAll(raw, today) {
    const d = raw && raw.data && Array.isArray(raw.data.products) ? raw.data : raw;
    if(!d || !Array.isArray(d.events) || !Array.isArray(d.products) || !Array.isArray(d.logs))throw new Error('不是有效的旧版纸上赶稿备份');
    const results=[];
    for(const p of d.products){
      const e=d.events.find(e=>e.id===p.eventId);
      try{
        const converted=migratePreview({product:p,event:e,logs:d.logs,today});
        results.push({productId:p.id,title:p.title,preview:converted,plan:core.plan(converted.input)});
      }catch(err){results.push({productId:p.id,title:p.title,error:String(err.message||err)});}
    }
    return results;
  }
  return Object.freeze({migratePreview,previewAll});
});