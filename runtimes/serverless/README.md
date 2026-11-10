# FractaFunction — runtime portable, adaptateurs séparés

**Contrat métier canonique :** `operium.fracta-function.web.v1`.
Une FractaFunction reçoit un `Request` standard et un contexte explicitement
construit par l'hôte, et retourne un `Response` standard. Elle ne suppose ni
Netlify, ni Cloudflare Workers, ni Supabase Edge Functions, ni Fracta2.

Les *adaptateurs* se chargent de convertir les conventions d'un fournisseur
sans modifier la fonction métier. Le contrat Web reste utilisable en Node.js,
Deno et dans des environnements compatibles Web APIs.

Dans ce premier lot :

- `contract.js` : vérification du contrat Web et manifeste explicite de routes
- `node-adapter.js` : compatibilité partielle avec les **Netlify Functions
  classiques** (`handler(event, context)`, `statusCode`, `isBase64Encoded`)
- `deno-adapter.ts` : exécution d'une **Edge Function Deno** native
  `default (Request, context) => Response`
- `host.js` : hôte HTTP Node.js strictement loopback, routes explicitement
  injectées et requêtes limitées à 1 Mio
- `deno-host.ts` : hôte HTTP Deno strictement loopback, manifeste de routes
  fermées, URL publique reconstruite depuis configuration de confiance

**Limites voulues :** aucune émulation des identités Netlify, AWS Lambda,
Cloudflare ou Supabase ; aucune fonction chargée depuis un chemin fourni par
une requête ; aucune variable Vault publiée ; aucun mandat COP généré par
l'adaptateur. Les sources qui dépendent de Netlify Blobs, du contexte `site`,
`geo`, des streams propres au fournisseur, d'un fournisseur de secrets ou
qui importent les modules spécifiques à Netlify nécessitent un adaptateur
additionnel explicitement testé. Les routes `/*` nécessiteront un routeur
paramétré spécifique ; elles ne sont pas silencieusement interprétées ici.

Plus tard, des adaptateurs `cloudflare-worker`, `supabase-edge` et
`netlify-edge` pourront appeler la **même fonction Web**. Ils devront
implémenter le routage, l'authentification des connexions et les permissions
adaptées à leur hôte, sans substituer les identités de transport aux mandats COP.

Les tests ne prouvent pas encore un déploiement de production. Aucun service
systemd ni DNS n'est activé par ce lot. La première migration réelle pourra
commencer par une fonction JHN en lecture ou par une route de refus non
engageante, avant la publication générale.

Tests :

```sh
node --test runtimes/serverless/*.test.js
/home/ubuntu/.local/lib/node_modules/deno/deno test --no-check runtimes/serverless/*.test.ts
```

## Recette de 2026-11-10 : deux fonctions JHN réelles, sans exposition publique

Les pilotes de Fracta2 n'inventent aucune fonction métier :

- `jhn-node-pilot.js` importe `cc-petition-pdf.js` d'Inseme et monte exactement
  le chemin PDF JHN sur `127.0.0.1:8799` ; un `POST` produit le `405` attendu,
  sans téléchargement externe ni modification de données. Un `GET` effectif
  peut télécharger le PDF depuis GitHub ; il est donc à vérifier séparément.
- `jhn-deno-pilot.ts` importe l'Edge Function existante
  `principal-consent-proxy.js` sur `127.0.0.1:8797`. Sans jeton Supabase,
  son `GET` est refusé avec `401` ; aucune décision COP n'est inscrite.
  **Ce relais retourne par conception un `503` pour un `401` en provenance de
  l'upstream** ; avant de l'exposer en production, examiner son traitement
  des réponses d'authentification et ne pas supposer une validation bout en
  bout sur la seule base des tests anonymes.

Ces pilotes sont des **adaptateurs de transition** pour du code conçu pour
Netlify. Le contrat métier désiré reste une FractaFunction Web native.

Recette de démarrage sans privilèges :

```sh
cd /srv/cogentia/repos/operium
node runtimes/serverless/jhn-node-pilot.js
# terminal séparé :
FRACTAFUNCTION_DENO_PILOT_PORT=8797 \
  /home/ubuntu/.local/lib/node_modules/deno/deno run --no-check \
  --allow-net=127.0.0.1:8797 \
  --allow-env=FRACTAFUNCTION_DENO_PILOT_PORT \
  runtimes/serverless/jhn-deno-pilot.ts
```

Deux unités systemd exemples sont fournies. **Elles ne sont ni installées, ni
activées.** Aucun Caddy ni DNS n'est modifié. Le service Node pilote ne
reçoit pas de clés d'administration. Le service Deno n'a aucune permission
`--allow-read`, `--allow-write`, `--allow-run` ou `--allow-env` générale.

L'activation ultérieure doit s'effectuer après une revue des chemins, du
contrat de réponse, des secrets strictement nécessaires, du comportement
sur méthodes GET/POST et de l'authentification réelle. Il faut distinguer
**compatibilité de signature** et **parité fonctionnelle de production**.

## JHN shared preview (2026-11-10)

The real JHN facade is `jhn-preview.js`: one loopback-only Node HTTP entry
point that serves the already-built SPA and uses the explicit
`jhn-functions-manifest.js` to dispatch to:

- the canonical COP Principal listener at `127.0.0.1:8796` (authenticated;
  no new issuer or mandate authority);
- the legacy Netlify Node PDF function (through the Node adapter);
- a persistent Deno worker at `127.0.0.1:8797` executing the real Corsica
  context function (through the Deno Web Request/Response adapter).

The Deno worker also includes the legacy Principal-consent Netlify proxy for
compatibility checks, but **the JHN facade never uses that proxy** for consent:
the canonical COP listener is addressed directly, preserving its real 401/403
responses and fixed `Host` header. In particular, the HTTP adapter uses
`node:http` because a generic `fetch()` may rewrite the canonical Host on
loopback.

All unconfigured `/api/*` and `/.netlify/*` paths return 404 rather than an
HTML SPA fallback. The preview listens only on loopback; its browser origin is
not the production HTTPS origin, so production Supabase login and ratification
are not yet proven.

Operational preflight, systemd unit templates, and a deliberate future Caddy
cutover template are in [`deploy/JHN-MIGRATION.md`](deploy/JHN-MIGRATION.md).
**This source commit does not install or activate systemd or change DNS/Caddy.**
