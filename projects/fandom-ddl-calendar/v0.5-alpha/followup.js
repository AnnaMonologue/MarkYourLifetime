/* 纸上赶稿 P1：独立催稿状态、提醒与交付历史（纯逻辑，不操作 DOM）。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FandomFollowUpP1 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const statuses = Object.freeze(['pending','submitted','revision','accepted']);
  const localDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  function addDays(iso, n) {
    if (!localDay(iso)) return null;
    const [y,m,d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d+n));
    return date.toISOString().slice(0,10);
  }
  function statusOf(step) {
    if (step.completed) return 'accepted';
    const s = step.deliveryStatus;
    return statuses.includes(s) && s !== 'accepted' ? s : 'pending';
  }
  function currentRevision(step) {
    const a = Array.isArray(step.revisions) ? step.revisions : [];
    return a.length ? a[a.length-1] : null;
  }
  function targetDate(step, calculated, shipping = false) {
    if (shipping) return calculated || null;
    const active = currentRevision(step);
    return (active && active.dueDate) || step.promisedDelivery || calculated || null;
  }
  function targetKey(step, date) {
    return `${currentRevision(step)?.id || 'base'}|${date || 'unknown'}`;
  }
  function contacted(step, date) {
    const key = targetKey(step,date);
    return (step.contactHistory || []).some(entry => entry.targetKey === key);
  }
  function stateFor(step, calculatedDate, today, shipping=false) {
    const status = statusOf(step);
    const date = targetDate(step,calculatedDate,shipping);
    const remindDays = Math.max(0,Math.floor(Number(step.remindDays ?? 7) || 0));
    const reminderDate = remindDays > 0 && date ? addDays(date,-remindDays) : null;
    const hasContact = !!date && contacted(step,date);
    let bucket = null;
    if (status !== 'accepted') {
      if (status === 'submitted') bucket = 'review';
      else if (date && today > date) bucket = 'overdue';
      else if (date && today === date) bucket = 'due';
      else if (status === 'revision' && date && reminderDate && today >= reminderDate && !hasContact) bucket = 'revision';
      else if (reminderDate && today >= reminderDate && !hasContact) bucket = 'contact';
    }
    return {status, date, reminderDate, remindDays, hasContact, bucket, targetKey:targetKey(step,date),
      actionable: !!bucket, severity:bucket==='overdue'?'critical':bucket==='due'?'important':'normal'};
  }
  function recordContact(step, at, note='', id='', calculatedDate=null, shipping=false) {
    if (!localDay(at)) throw Error('联系日期无效');
    const target = targetDate(step,calculatedDate,shipping);
    if (!target) throw Error('尚无有效交稿日期');
    const row = {id:id||'contact-'+Date.now(),date:at,targetKey:targetKey(step,target),targetDate:target,note};
    (step.contactHistory ||= []).push(row);
    return row;
  }
  function updateDelivery(step, next, date, note='', id='') {
    if (!statuses.includes(next)) throw Error('交付状态无效');
    const from=statusOf(step);
    if (from==='accepted' && next!=='accepted') throw Error('已验收的工序必须创建返修节点，不能抹去完成历史');
    if ((next==='accepted') && date && !localDay(date)) throw Error('验收日期无效');
    if ((next==='submitted') && date && !localDay(date)) throw Error('提交日期无效');
    if (next==='accepted') {step.completed=true;step.completedAt=date||step.completedAt||null;}
    else {step.completed=false;step.completedAt=null;}
    step.deliveryStatus=next;
    const entry={id:id||'event-'+Date.now(),type:next,date:date||null,note,previous:from};
    (step.deliveryHistory ||= []).push(entry);
    return entry;
  }
  function requestRevision(step,{date,dueDate,note='',id=''}) {
    if (statusOf(step)==='accepted') throw Error('已验收，请创建独立返修工序');
    if (!localDay(date) || (dueDate && !localDay(dueDate))) throw Error('返修日期无效');
    const rev={id:id||'revision-'+Date.now(),requestedAt:date,dueDate:dueDate||null,note};
    (step.revisions ||= []).push(rev);
    updateDelivery(step,'revision',date,note);
    return rev;
  }
  function followupLabel(bucket) {
    return ({contact:'待联系',due:'今日交稿',overdue:'交付逾期',review:'待验收',revision:'返修待跟进'})[bucket] || '—';
  }
  return Object.freeze({addDays,statusOf,currentRevision,targetDate,targetKey,contacted,stateFor,recordContact,updateDelivery,requestRevision,followupLabel});
});
