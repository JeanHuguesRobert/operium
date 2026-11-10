/** Public JHN routes formerly hosted by Netlify, explicit readiness register.
 * Migrated routes are owned by jhn-functions-manifest.js. The remainder
 * reject with an unambiguous status, never an HTML SPA fallback.
 */
export const JHN_PENDING_ROUTES=Object.freeze([
  {path:'/api/nasa/control',reason:'supabase_operator_vault_not_integrated'},
  {path:'/api/interactions/desk',reason:'supabase_case_read_auth_not_integrated'},
  {path:'/api/jhn-cop-events',reason:'cop_event_ingress_requires_protected_vault'},
  {path:'/api/webhooks/github',reason:'webhook_signature_and_delivery_not_integrated'},
  {path:'/api/oleole/*',reason:'presence_auth_and_storage_not_integrated'},
  {path:'/artifact-access/*',reason:'artifact_token_service_role_not_integrated'},
]);
export const JHN_MIGRATION_STATUS='partial';
