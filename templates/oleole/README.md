# Olé Olé Fracta preview

This template exposes a fully read/write Olé Olé preview at
`https://fracta.fractavolta.com/oleole/`. It intentionally uses the same JHN
Supabase project and JHN instance vault as the Netlify production service.

For the Fracta development preview, enable the optional `oleole` service in
the already-running Deno Magistral host, then insert the Caddy fragment before
Fracta's catch-all `handle`:

```ini
# /etc/systemd/system/magistral.service.d/oleole-preview.conf
[Service]
Environment=FRACTA_HTTP_SERVICES=oleole
```

This intentionally shares the Deno process with Magistral to keep the Fracta
development footprint low. It is an opt-in preview configuration, not the
production deployment profile for `oleole.acorsica.org`.

The static release directory must contain the output of:

```text
pnpm --filter @inseme/app-oleole run build:fracta-preview
```

The shared Deno process reads only the established Inseme bootstrap configuration;
Olé Olé application secrets remain resolved from the JHN vault. Any database
migration must remain compatible with the still-running Netlify production
version until that version is deployed too.
