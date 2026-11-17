/**
 * Conservative, runtime-only inference of Cloudflare Workers Free entitlement
 * using an authenticated account-scoped token and account subscriptions.
 *
 * Empty subscription list is meaningful only when the complete account-level
 * request succeeded. Unknown/partial data is NEVER interpreted as Free.
 * For #338 no-bill mode; do not use this test to authorize a Paid account.
 */
export function inferWorkersFreePlan({
  accountTokenActive = false,
  subscriptionsOk = false,
  subscriptions = null,
  workersSettingsOk = false,
} = {}) {
  return accountTokenActive === true && subscriptionsOk === true &&
    workersSettingsOk === true &&
    Array.isArray(subscriptions) && subscriptions.length === 0;
}
