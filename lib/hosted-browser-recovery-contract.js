/**
 * OP-BUG-010: pure, fail-closed decision contract for Hosted Browser RFB recovery.
 * This module never mutates systemd state. Caller must use an authorized
 * Operium operational capability; decisions do not grant that capability.
 */
export function decideRfbRecovery({
  mandate,
  current,
  baseline,
  sessions,
  probes,
  attempts = 0,
} = {}) {
  const blocked = reason => ({
    decision: 'blocked',
    reason,
    authorized_effect: 'none',
    recovery_state: 'NOT_RECOVERED',
  });
  if (mandate?.allow_rfb_restart !== true) return blocked('restart_not_authorized');
  if (!baseline?.revision || !current?.revision ||
      baseline.revision !== current.revision) return blocked('baseline_drift_or_unknown');
  if (baseline.unit !== current.unit ||
      !/^hosted-browser-rfb@[a-z0-9_-]+\.service$/.test(current.unit || '')) {
    return blocked('unit_not_verified');
  }
  if (current.parent_browser_active !== true) return blocked('parent_browser_not_active');
  if (sessions?.impact_known !== true) return blocked('client_impact_unknown');
  if (sessions.active_clients > 0 && mandate?.accept_client_disconnect !== true) {
    return blocked('active_rfb_clients');
  }
  if (!Number.isInteger(attempts) || attempts !== 0) return blocked('recovery_budget_exhausted');
  if (!probes || probes.local_rfb !== 'failed') return blocked('no_confirmed_local_rfb_failure');
  if (probes.local_https === 'failed') return blocked('parent_https_failure_outside_rfb_scope');
  return {
    decision: 'eligible',
    reason: 'authorized_bounded_rfb_recovery',
    authorized_effect: 'one_targeted_rfb_restart',
    target_unit: current.unit,
    max_attempts: 1,
    postconditions: ['local_rfb_protocol_responsive', 'fractal_proxy_rfb_protocol_responsive',
      'parent_browser_active', 'authorized_framebuffer_usable'],
    on_missing_evidence: 'UNVERIFIED',
  };
}
