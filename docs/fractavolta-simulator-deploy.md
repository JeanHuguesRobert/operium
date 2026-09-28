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

## Observed deployment state & evidence (2026-09-28)

- **Application commit**: `JeanHuguesRobert/FractaVolta@9536b51`
- **Host**: `fracta2` (ARM64, Ubuntu 24.04, Tailscale `100.84.109.87`)
- **Python venv**: `/srv/cogentia/venvs/fractavolta-sim` (Python 3.12.3)
- **Dependencies**: `streamlit==1.64.0`, `pandas==3.0.6`, `plotly==7.1.0`
- **Supervisor**: systemd unit `/etc/systemd/system/fractavolta-mobile-energy-sim.service`
  - Active and enabled (`systemctl status fractavolta-mobile-energy-sim` -> `active (running)`)
  - Bound strictly to Tailscale IP: `100.84.109.87:8502`
- **Model test**:
  - `python3 test_model.py` executed successfully:
    - Baseline: `OK`, `0.9428` fixed vs `0.4757` mobile €/kWh (683.7 km light tractor vs 2,293.8 km)
    - Autonomy scenario: `AUTO 0.3249` (reduced transport labour, handling/vehicle cost preserved)
    - Towing capacity independence: `TOWING 1800 32000` (kg separated from kWh payload)
    - Retail price & margin: `RETAIL -0.0591 0.1909 0.5709` (delivered-kWh margin increases with retail price; break-even TTC yields zero margin at 0.571 €/kWh)
    - User fuel savings: `USER_SAVINGS 9.75 19.5 39.0` (positive monthly savings proportional to monthly mileage for Petit, Moyen, Gros rouleur profiles)
    - Corsica GIS & Register: `CORSICA_GIS_OK 64.6 km 742 producers 233.1 MWc`
    - Fleet Sizing & HTA buffering: `FLEET_SIZING_OK 2 containers 4 light 1 heavy`
- **Register-to-Simulation Bridge (Option 1)**:
  - Dynamic scale selector: 12 MVP pilot sites, Seconde Vie Imminente ≤ 2030 (61 sites / 24.1 MWc), Court terme 2031–2035 (145 sites / 99.9 MWc), Total Seconde Vie ≤ 2035 (206 sites / 124.1 MWc), utility-scale HTA solar farms (34 sites / 154.6 MWc), regional basins (Plaine Orientale, Ajaccio, Bastia, Corte), or custom filtered subsets.
  - Interactive "Simuler cette sélection" action in the Register tab to inject filtered criteria directly into the simulation engine.
  - Macro fleet dimensioning: automatic computation of required 3 MWh storage containers, heavy tractor shifts, light capillary tractor shifts, and avoided fossil CO2 emissions.
  - Physical HTA direct buffering vs BT capillary aggregation: utility-scale solar farms host 3 MWh swap bodies on site (0 light km), while BT distributed sites use light capillary rotations.
- **GIS & Cartography**:
  - OpenStreetMap base map (`Scattermap` with `open-street-map` style, centered on Corte).
  - 3 primary road corridors: T20 (Ajaccio–Corte–Bastia), T10 (Bastia–Aléria–Porto-Vecchio), T50 (Corte–Aléria).
  - 4 urban hubs and fast-charging stations: Bastia, Corte, Ajaccio, Porto-Vecchio.
  - 4 regional mobile buffer positions: Casamozza, Mezzavia, Corte, Cateraggio / Aléria.
  - Dynamic map display synced to the active simulation scope (highlighting simulated solar sites and transport corridors).
- **Official EDF Solar Producers Register**:
  - Dataset: 742 installations (233.1 MWc) selling to EDF-SEI in Corsica from ODRÉ national open data registry.
  - Seconde Vie contract expiration horizons computed (commissioning + 20 years):
    - ≤ 2030 (imminent): 24.1 MWc (61 sites)
    - 2031–2035 (court terme): 99.9 MWc (145 sites)
    - Total Seconde Vie potential by 2035: 124.1 MWc (53.2 % of Corsican solar fleet)
  - Interactive multi-criteria filters: Bassin / Hub, Tension (HTA vs BT), Horizon Seconde Vie, and full-text commune search.
  - One-click CSV export of filtered register (`registre_producteurs_edf_corse.csv`).
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
  - Streamlit host config `https://fracta.fractavolta.com/simulateur/_stcore/host-config` -> `200 OK`
- **Editorial page**: `https://fractavolta.com/fr/simulateur` verified HTTP 200 OK, with direct link to live app.
- **Regression checks**:
  - `https://fracta.fractavolta.com/` -> `200 OK` ("Fracta node online")
  - `https://fracta.fractavolta.com/oleole/` -> `200 OK` (Olé Olé preview)




