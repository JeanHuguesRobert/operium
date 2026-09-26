---
title: "FractaVolta simulator — deployment and health"
date: "2026-09-26"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: proposed
---

# FractaVolta simulator — deployment and health

## Desired topology

```text
Browser
  -> https://fracta.fractavolta.com/simulateur/
  -> Caddy on fracta
  -> Tailscale
  -> Streamlit on fracta2 :8502
  -> FractaVolta/simulators/mobile-energy-buffers
```

## Application repository

Source: `JeanHuguesRobert/FractaVolta/simulators/mobile-energy-buffers/`

Application-side deployment fragments:

- `deploy/fractavolta-mobile-energy-sim.service`
- `deploy/Caddyfile.fracta.fragment`

Those files are application artifacts only. Live service state, routing,
health evidence, and apply procedure are owned by Operium.

## Proposed apply sequence

1. Inspect `fracta2` resource headroom.
2. Fast-forward the FractaVolta checkout on `fracta2`.
3. Create `/srv/cogentia/venvs/fractavolta-sim`.
4. Install `requirements.txt` into that venv.
5. Install and enable `fractavolta-mobile-energy-sim.service` on `fracta2`.
6. Verify the service only listens on the intended Tailscale address and port.
7. Add the `/simulateur` matcher to the existing `fracta.fractavolta.com` Caddy site block on `fracta`.
8. Validate Caddy configuration and reload.
9. Run HTTP and WebSocket smoke tests through the public URL.
10. Record observed state and health in Operium.

## Rollback

- Disable the simulator unit on `fracta2`.
- Remove the `/simulateur` Caddy matcher on `fracta`.
- Validate and reload Caddy.
- The static `fractavolta.com/fr/simulateur` page may remain.

## Health criteria

- public page returns HTTP 200;
- Streamlit static assets load under `/simulateur`;
- WebSocket/session connection succeeds;
- parameter change triggers recalculation;
- unrelated `fracta.fractavolta.com` paths are unchanged;
- `fracta` and `fracta2` remain within safe memory headroom.
