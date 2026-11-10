/** Bounded JHN routing manifest. No filesystem or arbitrary module imports from URL. */
import {invokeNodeFunction} from './node-adapter.js';
import {handler as ccPdf} from '../../../inseme/apps/platform/netlify/profiles/jhn/functions/cc-petition-pdf.js';
import {createLocalConsentProxy} from './consent-local-adapter.js';
import {createDenoLoopback} from './deno-local-adapter.js';
import {routeMatches} from './contract.js';
export const PUBLIC_ORIGIN='https://jhn.baronsmariani.org';
export const JHN_ROUTES=Object.freeze([
 {path:'/api/cop/principal-consent/*',runtime:'canonical-cop',invoke:createLocalConsentProxy()},
 {path:'/cc/requete-conseil-constitutionnel-haute-corse-2026.pdf',runtime:'node',invoke:r=>invokeNodeFunction(ccPdf,r)},
 {path:'/api/corsica/context',runtime:'deno',invoke:createDenoLoopback()},
 {path:'/api/chat-stream',runtime:'deno',invoke:createDenoLoopback()},
]);
export const jhnRoutes=JHN_ROUTES.map(route=>({
  match:path=>routeMatches(route.path,path),invoke:route.invoke
}));
