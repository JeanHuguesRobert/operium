/** Read-only guard for legacy JHN owner APIs.
 * The source Edge functions still own Supabase authentication and Vault checks.
 * Until their vault integration is proven on Fracta2, valid requests fail
 * closed there. No bypass, no service-role credentials or mock identity.
 */
import nasaControl from '../../../inseme/apps/platform/netlify/edge-functions/nasa-control.js';
import interactionsDesk from '../../../inseme/apps/platform/netlify/edge-functions/interactions-desk.js';
function response(status:number,error:string){
 return Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
}
function bearer(request:Request){
 const value=request.headers.get('authorization')||'';
 return /^Bearer\s+[^\s]{10,8192}$/i.test(value);
}
export async function nasaReadonly(request:Request):Promise<Response>{
 if(request.method!=='GET')return response(405,'nasa_read_only_preview');
 if(!bearer(request))return response(401,'missing_bearer_token');
 return nasaControl(request);
}
export async function interactionsReadonly(request:Request):Promise<Response>{
 if(request.method!=='GET')return response(405,'interactions_read_only_preview');
 if(!bearer(request))return response(401,'missing_bearer_token');
 return interactionsDesk(request);
}
