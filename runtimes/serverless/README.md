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
