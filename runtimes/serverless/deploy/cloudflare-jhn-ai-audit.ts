/**
 * Cogentia #338. Read-only Workers AI eligibility audit via the EXISTING
 * JHN Instance Vault on Fracta2. No credential values, account IDs or
 * vendor response bodies are ever printed, logged, or serialized.
 *
 * Transport is fixed to the official Cloudflare API; no arbitrary URL,
 * mutation, inference, secret export, or service configuration effect.
 */
import { newSupabase } from '../../../../inseme/packages/cop-host/src/config/instanceConfig.edge.js';
import { createJhnVaultSecretLease } from '../../../../inseme/apps/platform/scripts/lib/vault-secret-lease.js';
import {inferWorkersFreePlan} from './cloudflare-workers-free-plan.js';

const CONFIGURED_API_BASE = 'https://api.cloudflare.com/client/v4';
const action = Deno.args[0] || 'audit';
if (!['audit','smoke'].includes(action)) throw Error('unsupported_cloudflare_action');
// Fixed one-line PUBLIC text, 1 model, 1 request, no fallback, no query-sourced data.
const SMOKE_MODEL = '@cf/google/embeddinggemma-2';
const SMOKE_TEXT = 'Cogentia construit une mémoire documentaire ouverte, réversible et multilingue.';
const statuses: Record<string, {http_status: number|string; success: boolean; hint?: string}> = {};
const record = (key: string, code: number|string, success = false, hint?: string) => {
  statuses[key] = {http_status: code, success, ...(hint ? {hint} : {})};
};

const admin = newSupabase(true);
const vault = createJhnVaultSecretLease({client: admin});
let report: Record<string, unknown> = {
  schema: 'operium.cloudflare_workers_ai_vault_audit.v1',
  instance: 'jhn',
  read_only: action === 'audit',
  action,
  monetary_budget_usd: 0,
  vault_refs: ['jhn-vault:cloudflare_account_id','jhn-vault:cloudflare_api_key'],
  credentials_exposed: false,
  plan_verified_free: false,
  inference_allowed: false,
};
try {
  await vault.withSecret('jhn-vault:cloudflare_account_id', async (accountId: string) => {
    if (!/^[a-f0-9]{32}$/i.test(accountId)) throw Error('account_id_invalid');
    await vault.withSecret('jhn-vault:cloudflare_api_key', async (token: string) => {
      if (!token.trim()) throw Error('token_empty');
      const get = async (path: string, label: string) => {
        try {
          const res = await fetch(CONFIGURED_API_BASE + path, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(12000),
          });
          const data = await res.json().catch(() => null);
          const success = res.ok && data?.success === true;
          record(label,res.status,success);
          return success ? data?.result : null;
        } catch {
          record(label, 'network_error');
          return null;
        }
      };
      // Account-level pricing. Worker default_usage_model alone is NOT enough
      // to infer Paid/Free because it concerns requests, not billing plan.
      const subscriptions = await get(`/accounts/${accountId}/subscriptions`, 'subscriptions');
      const workersSettings = await get(`/accounts/${accountId}/workers/account-settings`, 'workers_settings');
      const tokenStatus = await get('/user/tokens/verify','token_verify');
      const accountTokenStatus = await get(`/accounts/${accountId}/tokens/verify`,'account_token_verify');
      const aiModels = await get(`/accounts/${accountId}/ai/models/search`,'ai_models');
      const modelRows = Array.isArray(aiModels) ? aiModels : [];
      const modelIds = new Set(modelRows.map((model: Record<string,unknown>) => model.name || model.id || model.model));
      const gemmaMeta = modelRows.find((model: Record<string,unknown>) =>
        (model.name || model.id || model.model) === SMOKE_MODEL);
      // Workers Paid is a subscription; Free has none. The account-wide
      // list is authoritative only when an account-scoped token is active
      // and the successful response is genuinely an array.
      const accountVerified = accountTokenStatus?.status === 'active';
      const freeInferred = inferWorkersFreePlan({
        accountTokenActive:accountVerified,
        subscriptionsOk:statuses.subscriptions?.success===true,
        subscriptions,
        workersSettingsOk:statuses.workers_settings?.success===true && Boolean(workersSettings),
      });
      const modelListed = modelIds.has(SMOKE_MODEL);
      const eligible = freeInferred && modelListed && Array.isArray(aiModels);
      report = {
        ...report,
        transport: 'Cloudflare API /client/v4',
        checks: statuses,
        subscription_entry_count: Array.isArray(subscriptions) ? subscriptions.length : null,
        workers_settings_accessible: Boolean(workersSettings),
        token_verified: tokenStatus?.status === 'active' || accountVerified,
        ai_models_accessible: Array.isArray(aiModels),
        ai_model_count: modelRows.length,
        model_metadata_keys: gemmaMeta ? Object.keys(gemmaMeta).filter(k=>/schema|input|format|context|task|type/i.test(k)) : [],
        target_model_listed: {
          embeddinggemma_2: modelListed,
          qwen3_embedding_06b: modelIds.has('@cf/qwen/qwen3-embedding-0.6b'),
        },
        free_plan_inferred_from_account_subscription_list: freeInferred,
        free_plan_evidence: freeInferred ? 'verified_account_token_and_zero_account_subscriptions' : 'insufficient',
        plan_verified_free: freeInferred,
        inference_allowed: action === 'smoke' && eligible,
      };
      if (action === 'smoke') {
        if (!eligible) {
          report.smoke = {attempted:false,reason:'not_admitted_by_free_plan_preflight'};
        } else {
          // Exact-purpose one-time public probe; never a reusable ungoverned
          // endpoint. This is a single, bounded Act under #338, not the
          // future batch worker's COP admission implementation.
          // EmbeddingGemma 2 is multimodal. Its documented native Workers AI
          // schema accepts text in `input`; do not assume that the legacy
          // OpenAI-compatible text-embedding schema covers this model.
          const url = `${CONFIGURED_API_BASE}/accounts/${accountId}/ai/run/${SMOKE_MODEL}`;
          try {
            const response = await fetch(url,{
              method:'POST',redirect:'error',
              headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
              body:JSON.stringify({input:[SMOKE_TEXT]}),
              signal:AbortSignal.timeout(16000),
            });
            const body = await response.json().catch(()=>null);
            const providerData = body?.result?.data || body?.result?.embeddings || body?.data;
            const vectors = Array.isArray(providerData)
              ? providerData.map((item:unknown)=>Array.isArray(item)?item:
                  (item && typeof item==='object' ? (item as Record<string,unknown>).embedding : null))
              : [];
            const valid = response.ok && body?.success === true &&
              vectors.length === 1 && Array.isArray(vectors[0]) &&
              vectors[0].length === 768 &&
              vectors[0].every((value:unknown)=>typeof value === 'number' && Number.isFinite(value));
            report.smoke = {
              attempted:true,http_status:response.status,valid,
              vector_dimensions:valid?768:null,
              provider_model_matches:body?.model===SMOKE_MODEL || body?.success===true,
              response_shape_keys:response.ok && body?.result ? Object.keys(body.result).slice(0,8) : [],
              // Never return the vector or the full provider payload.
              usage_prompt_tokens:Number.isSafeInteger(body?.usage?.prompt_tokens)
                ? body.usage.prompt_tokens:null,
              error_codes:response.ok?[]:Array.isArray(body?.errors)
                ?body.errors.map((e:Record<string,unknown>)=>Number(e.code)||0).slice(0,4):[],
            };
          } catch {
            report.smoke = {attempted:true,valid:false,reason:'provider_transport_failure'};
          }
        }
      }
    });
  });
  console.log(JSON.stringify(report));
} catch {
  console.log(JSON.stringify({...report, checks: statuses, vault_access: 'failed_or_unsupported',
    plan_verified_free:false,inference_allowed:false}));
  Deno.exitCode=1;
}
