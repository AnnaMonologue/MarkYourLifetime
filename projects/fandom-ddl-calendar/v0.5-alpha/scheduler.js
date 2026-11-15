/* 纸上赶稿 P0 — Pure scheduling core, browser + Node (CommonJS), 2026-11-15.
   No DOM, no localStorage, no mutation of input. Dates are calendar days, not elapsed hours.
   This is a separately testable module, NOT a drop-in replacement for v0.3.1. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FandomSchedulerP0 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('日期必须是 YYYY-MM-DD: ' + s);
    const t = Date.parse(s + 'T00:00:00.000Z');
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error('非法日期: ' + s);
    return t;
  }
  function dateOf(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDate(s, n) { if (!Number.isInteger(n)) throw new Error('日期偏移必须是整数'); return dateOf(parseDate(s) + n * DAY); }
  function daysBetween(a, b) { return (parseDate(b) - parseDate(a)) / DAY; }
  function maxDate(...xs) { return xs.reduce((a, b) => !a || b > a ? b : a, null); }
  function minDate(...xs) { return xs.reduce((a, b) => !a || b < a ? b : a, null); }
  function asDate(value) { return value == null || value === '' ? null : (parseDate(value), value); }
  function nonneg(value, label) { if (!Number.isInteger(value) || value < 0) throw new Error(label + '必须为非负整数'); return value; }

  // Graph convention: each step occupies 1+ full calendar dates, a successor starts the next day.
  // A terminal step must finish by production-ready deadline. Milestones shipping/receipt are separate.
  function plan(req) {
    if (!req || typeof req !== 'object') throw new Error('缺少排程输入');
    const now = asDate(req.today), receipt = asDate(req.receiptDeadline);
    if (!now || !receipt) throw new Error('需要今天和收货 DDL');
    const transit = nonneg(req.transitDays, '运输提前天数');
    const buffer = nonneg(req.handoffBufferDays, '寄出前缓冲天数');
    const latestDispatch = addDate(receipt, -transit);
    const latestProductReady = addDate(latestDispatch, -buffer);
    const steps = req.steps || [];
    if (!Array.isArray(steps)) throw new Error('工序需要数组');
    const byId = new Map(), succ = new Map(), indegree = new Map();
    for (const s of steps) {
      if (!s || typeof s.id !== 'string' || !s.id.trim() || byId.has(s.id)) throw new Error('工序 ID 为空或重复');
      if (!Number.isInteger(s.days) || s.days < 1) throw new Error('工序预计工期至少一天: ' + s.id);
      if (s.predecessors && !Array.isArray(s.predecessors)) throw new Error('前置工序必须是数组');
      for (const k of ['actualFinished', 'promisedDelivery', 'dueBy']) asDate(s[k]);
      byId.set(s.id, s); succ.set(s.id, []); indegree.set(s.id, 0);
    }
    for (const s of steps) {
      const seen = new Set();
      for (const p of (s.predecessors || [])) {
        if (!byId.has(p) || p === s.id || seen.has(p)) throw new Error('未知/重复/自引用依赖: ' + s.id + ' → ' + p);
        seen.add(p); succ.get(p).push(s.id); indegree.set(s.id, indegree.get(s.id) + 1);
      }
    }
    const order = [], ready = steps.filter(s => !indegree.get(s.id)).map(s => s.id);
    for (let i = 0; i < ready.length; i++) {
      const id = ready[i]; order.push(id);
      for (const child of succ.get(id)) {
        indegree.set(child, indegree.get(child) - 1);
        if (!indegree.get(child)) ready.push(child);
      }
    }
    if (order.length !== steps.length) throw new Error('工序依赖中存在循环');
    const rows = Object.create(null), diagnostics = [];
    const emit = (type, stepId, detail = {}) => diagnostics.push({type, stepId, ...detail});

    // Reverse pass — completed steps must NOT be filtered out.
    for (const id of [...order].reverse()) {
      const s = byId.get(id);
      let latest = succ.get(id).length
        ? minDate(...succ.get(id).map(child => addDate(rows[child].latestStart, -1)))
        : latestProductReady;
      if (s.dueBy) latest = minDate(latest, s.dueBy);
      const start = addDate(latest, -s.days + 1);
      rows[id] = {
        id, latestStart: start, latestFinish: latest, forecastStart: null,
        forecastFinish: null, actualFinished: s.actualFinished || null,
        completed: !!s.completed, forecastConfidence: 'none', slackDays: null,
        latestProvisional: !!s.durationProvisional || succ.get(id).some(child => rows[child].latestProvisional)
      };
      if (s.promisedDelivery && s.promisedDelivery > latest)
        emit('promise_after_latest', id, {days: daysBetween(latest, s.promisedDelivery), promised: s.promisedDelivery, latest});
    }

    // Forward pass — if completion time is missing, block downstream instead of pretending it finished today.
    for (const id of order) {
      const s = byId.get(id), row = rows[id];
      if (s.completed) {
        row.forecastFinish = s.actualFinished || null;
        row.forecastConfidence = s.actualFinished ? 'actual' : 'unknown';
        if (!s.actualFinished) emit('missing_actual_date', id);
        else if (s.actualFinished > row.latestFinish)
          emit('historically_late', id, {days: daysBetween(row.latestFinish, s.actualFinished)});
        if (s.actualFinished) for (const pred of s.predecessors || []) {
          const p = byId.get(pred), r = rows[pred];
          if (!p.completed) emit('completed_before_predecessor', id, {predecessorId: pred});
          else if (r.actualFinished && s.actualFinished <= r.actualFinished)
            emit('actual_order_conflict', id, {predecessorId: pred});
        }
        continue;
      }
      if (s.promisedDelivery && s.promisedDelivery < now)
        emit('overdue_promise', id, {days: daysBetween(s.promisedDelivery, now), promised: s.promisedDelivery});
      const predecessors = (s.predecessors || []).map(p => rows[p]);
      if (predecessors.some(p => !p.forecastFinish)) {
        row.forecastConfidence = 'blocked';
        emit('blocked_by_unknown_predecessor', id, {predecessorIds: (s.predecessors || []).filter(p => !rows[p].forecastFinish)});
        continue;
      }
      const earliest = maxDate(now, ...predecessors.map(p => addDate(p.forecastFinish, 1)));
      const minExpected = addDate(earliest, s.days - 1);
      const forecast = s.promisedDelivery && s.promisedDelivery >= now
        ? maxDate(minExpected, s.promisedDelivery) : minExpected;
      row.forecastStart = earliest; row.forecastFinish = forecast;
      row.forecastConfidence = s.durationProvisional ? 'provisional' : 'estimated';
      row.slackDays = daysBetween(forecast, row.latestFinish);
      if (forecast > row.latestFinish) emit('predicted_late', id, {days: daysBetween(row.latestFinish, forecast)});
      if (s.durationProvisional) emit('unquantified_duration', id);
    }
    const actualDispatch = asDate(req.actualDispatch), actualReceipt = asDate(req.actualReceipt);
    if (actualDispatch) {
      if (actualDispatch > latestDispatch) emit('late_dispatch', null, {days: daysBetween(latestDispatch, actualDispatch)});
      if (steps.some(s => !s.completed)) emit('dispatched_with_incomplete_steps', null, {stepIds: steps.filter(s => !s.completed).map(s => s.id)});
      if (steps.some(s => s.completed && !s.actualFinished)) emit('dispatched_with_unknown_dates', null);
    }
    if (actualReceipt && actualReceipt > receipt) emit('late_receipt', null, {days: daysBetween(receipt, actualReceipt)});
    if (actualReceipt && !actualDispatch) emit('received_without_dispatch', null);
    return {
      today: now, receiptDeadline: receipt, latestDispatch, latestProductReady,
      predictedReceiptFromDispatch: actualDispatch ? addDate(actualDispatch, transit) : null,
      rows, order, diagnostics
    };
  }

  // Integer micro-units make even fractional P quantities sum exactly; partial pages use quantum=0.5.
  function allocateQuantity({total, initialDone = 0, logs = [], unit = 1, start, finish, excludedDates = []}) {
    if (!(unit > 0) || !Number.isFinite(unit) || !Number.isFinite(total) || !Number.isFinite(initialDone)) throw new Error('非法工作量');
    const toTicks = (v) => {const n=v / unit; if (Math.abs(n-Math.round(n)) > 1e-7) throw new Error('数量不是最小单位的整数倍');return Math.round(n);};
    let done = toTicks(initialDone);
    if (done < 0) throw new Error('初始完成量不能为负');
    for (const x of logs) if (!x.voided && !x.deleted) done += toTicks(Number(x.amount || 0));
    if (done < 0) throw new Error('累计完成量不能为负');
    const target = toTicks(total), left = Math.max(0, target - done);
    const dates = [];
    const excluded = new Set(excludedDates);
    if (daysBetween(start, finish) >= 0) for (let d = start; d <= finish; d = addDate(d, 1)) {
      if (!excluded.has(d)) dates.push(d);
    }
    const quotas = {};
    dates.forEach((date, i) => quotas[date] = (Math.floor((i+1)*left/dates.length)-Math.floor(i*left/dates.length))*unit);
    const planned = Object.values(quotas).reduce((a,b)=>a+b,0);
    return {target:target*unit, done:done*unit, remaining:left*unit, overTarget:Math.max(0,(done-target)*unit),
      quotas, unscheduled:left>0 && !dates.length ? left*unit : 0,
      conserved:Math.abs(planned - (left && dates.length?left*unit:0)) < 1e-7};
  }

  return Object.freeze({plan, allocateQuantity, addDate, daysBetween});
});