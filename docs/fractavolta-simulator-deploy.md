---
title: "FractaVolta simulator — deployment and health"
date: "2026-09-26"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
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

## Apply sequence

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

## Observed deployment state & evidence (2026-09-27)

- **Application commit**: `JeanHuguesRobert/FractaVolta@84f35da`
- **Host**: `fracta2` (ARM64, Ubuntu 24.04, Tailscale `100.84.109.87`)
- **Python venv**: `/srv/cogentia/venvs/fractavolta-sim` (Python 3.12.3)
- **Dependencies**: `streamlit==1.64.0`, `pandas==3.0.6`, `plotly==7.1.0`
- **Supervisor**: systemd unit `/etc/systemd/system/fractavolta-mobile-energy-sim.service`
  - Active and enabled (`systemctl status fractavolta-mobile-energy-sim` -> `active (running)`)
  - Bound strictly to Tailscale IP: `100.84.109.87:8502`
- **Model test**:
  - `python3 test_model.py` executed successfully:
    - Baseline: `OK`, `0.621` fixed vs `0.343` mobile €/kWh
    - Autonomy scenario: `AUTO 0.284` (reduced transport labour, handling/vehicle cost preserved)
    - Towing capacity independence: `TOWING 1800 32000` (kg separated from kWh payload)
    - Retail price & margin: `RETAIL 0.0737 0.3237 0.4116` (delivered-kWh margin increases with retail price; break-even TTC yields zero margin)
    - User fuel savings: `USER_SAVINGS 9.75 19.5 39.0` (positive monthly savings proportional to monthly mileage for Petit, Moyen, Gros rouleur profiles)
- **Public edge router**: Caddy on `fracta` (`82.70.234.207`)
  - Route block active within `fracta.fractavolta.com`:
    ```caddyfile
    @fractavolta_sim path /simulateur /simulateur/*
    handle @fractavolta_sim {
        reverse_proxy http://100.84.109.87:8502
    }
    ```
- **Public verification**:
  - HTTP GET `https://fracta.fractavolta.com/simulateur/` -> `200 OK` (Server: uvicorn, Via: 1.1 Caddy)
  - HTTP GET `https://fracta.fractavolta.com/simulateur` -> `307 Temporary Redirect` -> `308 Permanent Redirect` -> `200 OK`
  - Static assets (`./static/js/index.CcFifQPt.js`) -> `200 OK` (`application/javascript`)
  - Streamlit health probe `https://fracta.fractavolta.com/simulateur/_stcore/health` -> `200 OK`
  - Streamlit WebSocket stream `wss://fracta.fractavolta.com/simulateur/_stcore/stream` -> `101 Switching Protocols`
  - Dynamic page rendering tested via headless Chromium: `<title>FractaVolta — Buffers mobiles</title>`, reactive input sliders, autonomous driving parameter (0–100%), generic light/heavy tractor controls, towing capacity (kg) inputs, client retail price slider, delivered-kWh contributive margin, break-even TTC indicator, user fuel-savings panel ("Gain usager : passer du thermique à l’électrique" with Petit/Moyen/Gros rouleur profiles and energy-only disclaimer), and sensitivity curves (autonomy, retail price, and user fuel savings according to mileage) rendered into DOM
- **Editorial page**: `https://fractavolta.com/fr/simulateur` verified HTTP 200 OK, including sections on generic tractor classes, autonomous driving scenarios, client retail price/margin, and durable Corsican structural fuel context with institutional references (Autorité de la concurrence), with direct link to live app.
- **Regression checks**:
  - `https://fracta.fractavolta.com/` -> `200 OK` ("Fracta node online")
  - `https://fracta.fractavolta.com/oleole/` -> `200 OK` (Olé Olé preview)




