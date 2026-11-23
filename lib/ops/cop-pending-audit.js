/** Read-only cross-effect reservation inventory. Age is NOT evidence of
 * an absent effect. Never settle or release without a matching witness.
 */
export function auditPendingReservations(events,{asOf=new Date().toISOString(),minimumAgeHours=24}={}){
 const moment=Date.parse(asOf);
 if(!Number.isFinite(moment)||!Number.isFinite(minimumAgeHours)||minimumAgeHours<0)
  throw Error("INVALID_AUDIT_HORIZON");
 const pending=new Map();
 for(const event of events){
  const p=event.payload||{};
  if(event.event_type==="ExecutionBudgetReservation"&&p.reservation){
   const r=p.reservation;
   if(typeof r.reservation_id!=="string")continue;
   pending.set(r.reservation_id,{reservation_id:r.reservation_id,
     idempotency_key:r.idempotency_key??null,steps:r.demand?.max_steps??null,
     reserved_at:event.time?.recorded_at??null});
  }else if(["ExecutionBudgetRelease","ExecutionBudgetSettlement"].includes(event.event_type))
    pending.delete(p.reservation_id);
 }
 const items=[...pending.values()].map(r=>{
  const time=Date.parse(r.reserved_at||"");
  const age_hours=Number.isFinite(time)?Math.round((moment-time)/3600000*10)/10:null;
  return {...r,age_hours,
    state:age_hours!==null&&age_hours>=minimumAgeHours?"needs_evidence_reconciliation":"recent_or_unknown",
    decision:"no_mutation_without_effect_witness"};
 });
 return {schema:"operium.cop-pending-audit.v1",observed_at:asOf,minimum_age_hours:minimumAgeHours,
   total_pending:items.length,pending_steps:items.reduce((s,r)=>s+(Number.isInteger(r.steps)?r.steps:0),0),
   aged_count:items.filter(r=>r.state==="needs_evidence_reconciliation").length,items};
}
