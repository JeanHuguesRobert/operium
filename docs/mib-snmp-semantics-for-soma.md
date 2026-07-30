---
title: "SNMP MIB semantics → SOMA managed objects"
description: "How classic SNMP MIB groups guide useful attributes for Fractanet ONA/SOMA without reimplementing ASN.1 OIDs."
document_role: design
document_kind: guide
visibility: public
lifecycle_state: active
updated: "2026-07-30"
---

# SNMP MIB semantics → SOMA managed objects

**Audience:** control-room / La Nasa zoom, ONA attribute authors.  
**Companion:** [control-room-mib-lite-v0.md](control-room-mib-lite-v0.md), [soma-semantic-object-management-architecture.md](soma-semantic-object-management-architecture.md).

## 1. What we take from SNMP (and what we leave)

SNMP’s lasting value is not the BER encoding or dotted OIDs. It is the **discipline of a managed object**:

| SNMP idea | Keep for Fractanet | Leave behind |
|-----------|-------------------|--------------|
| **Object identity** (sysObjectID, name) | Stable `resource://…` id + class | Global OID registration bureaucracy |
| **Scalar system group** | Host / agent “who am I / am I ok” | Mandatory full RFC1213 compliance |
| **Tables of children** (ifTable, hrStorage) | SOMA `children[]` services / later ifaces | Dense columnar row status machinery |
| **Behavioural types** (Counter, Gauge, TruthValue) | SOMA `value_type` + `behaviour_type` | SMIv2 macros / ASN.1 modules |
| **Read-only walk first** | Mesh-open GET object / observations | SET storms, community strings in v0 |
| **Manager polls, agent answers** | La Nasa pull + last-known cache (P4) | Central NMS warehouse in v0 |

**Rule of thumb:** if an attribute would not appear on a good NOC “node zoom” for a router or server, do not put it in the default SOMA surface.

## 2. Classic MIB groups → our object model

### 2.1 System group (`SNMPv2-MIB::system`, RFC 3418)

| SNMP | Meaning | SOMA / ONA today | Next useful |
|------|---------|------------------|-------------|
| `sysDescr` | What is this thing | `class` + profile + ONA version | `system.description` free text |
| `sysObjectID` | Vendor type identity | `resource://…` + `operium.node` | Registry class tags |
| `sysUpTime` | Agent/host uptime | `system.uptime` | Keep; prefer host boot incarnation |
| `sysContact` | Who to call | — | `core.contact` (config) |
| `core` name / location | Where / label | `core.user-label`, hostname | `core.location` (site / room) |
| `sysServices` | Capability bitmask | SOMA `capabilities[]` | Facets already partial |

**Priority:** identity + uptime + label are **P0 zoom**. Contact/location are **P1 config** when multi-site grows.

### 2.2 Host resources (`HOST-RESOURCES-MIB`)

| SNMP | Meaning | Today | Next useful |
|------|---------|-------|-------------|
| `hrSystemUptime` | Host uptime | `system.uptime` | — |
| `hrMemorySize` / storage | RAM | `system.memory.total` / `.free` | `system.memory.used`, % used |
| `hrProcessorLoad` | CPU | — | `system.cpu.load1` / `load5` / `load15` (or %) |
| `hrStorageTable` | Disks | — | `system.storage.*` children later |
| `hrSWRunTable` | Processes | — | Out of default zoom; optional deep dive |

**Priority for Pi / phone / VPS:** **load + memory** beat process tables. Disk free on Fracta matters before phone process lists.

### 2.3 Interfaces (`IF-MIB`)

| SNMP | Meaning | Today | Next useful |
|------|---------|-------|-------------|
| `ifNumber` / `ifTable` | Links | — | Later: Tailscale / eth0 as `operium.interface` children |
| `ifOperStatus` | up/down | Probes approximate | `state.operational` on interface child |
| `ifInOctets` / `ifOutOctets` | Counters | — | Only if we need traffic zoom |

**Priority:** not for La Nasa v0. Mesh health is better as **peer reachability + probe latency** than raw octets.

### 2.4 Application / service probes (net-snmp style, not one RFC)

SNMP shops often add custom OIDs for “is Apache up”. We already model that better:

| Custom SNMP habit | Fractanet |
|-------------------|-----------|
| Boolean “service X up” | SOMA child `operium.service` + `state.operational` |
| Latency gauge | `service.probe-latency` |
| Skip if N/A | probe `skipped` + reason in status |

**Keep expanding services as children**, not as a flat bag of `service.foo.ok` scalars on the node.

### 2.5 Operium-specific (no SNMP equivalent — still “MIB-shaped”)

| Attribute / surface | Role | SNMP analogy |
|---------------------|------|--------------|
| `state.health` | Aggregated health score | Like a vendor health OID |
| `peer_count_fresh` (status) | Mesh peers | Like CDP/LLDP neighbour count |
| Probe items (ona, gateway, aggregator) | Critical path | Like monTable / discStatus |
| Jobs (heartbeat…) | Scheduled agent work | Like cron health, not classic MIB |
| COP outbox pending | Store-forward backlog | Message queue depth OID |

These belong in zoom because operators ask them first on Fractanet.

## 3. Attribute design rules (SMI habits, JSON form)

1. **Name by domain, not by UI.**  
   `system.memory.free` not `zoomMemFree`.

2. **One semantic per leaf.**  
   Do not overload `state.health` with both score and “why”. Put reasons in probes / drift.

3. **Prefer Gauge + unit over free text** for quantities.  
   Unit lives on the observation (`byte`, `second`, `millisecond`).

4. **Counters only when monotonic and useful.**  
   Skip counters until something consumes rates.

5. **Children for repeating structure.**  
   Services, disks, interfaces → `children[]`, not `disk1`, `disk2` scalars.

6. **Vocabulary entry for every public attribute.**  
   `semantics` string = the one-line SNMP DESCRIPTION spirit.

7. **Default zoom budget.**  
   A good node zoom fits on 1024×768 without scrolling past:  
   identity, system (uptime/mem/load), probes, ≤10 attributes, children, observations.  
   Everything else is “Raw” or a future tab.

## 4. Recommended attribute roadmap (guided by MIB usefulness)

### Already good enough (keep, polish labels only)

- `core.user-label`, `system.hostname`, `system.platform`, `system.architecture`
- `system.uptime`, `system.memory.total`, `system.memory.free`
- `system.memory.used`, `system.memory.used_percent` (**added 2026-07-30**)
- `system.cpu.load1` / `load5` / `load15` (**added 2026-07-30**, UNIX only; omitted on Windows)
- `state.operational`, `state.health`
- `service.probe-latency` on service children

### Identity (sysLocation / sysContact) — **added 2026-07-30**

| Attribute | Env | Example (Fractanet / Institut Mariani) |
|-----------|-----|----------------------------------------|
| `core.location` | `ONA_LOCATION` or `ONA_SYS_LOCATION` | `Institut Mariani, 1 cours Paoli, F-20250 Corte` |
| `core.contact` | `ONA_CONTACT` or `ONA_SYS_CONTACT` | `jhr@baronsmariani.org` |

Configuration scalars (not gauges). Omitted from the object when unset.

### Next (high value / low cost)

| Attribute | MIB spirit | Why operators care |
|-----------|------------|--------------------|
| `state.health.reasons` (or status.probes only) | vendor health detail | Avoid duplicate if probes exist |

### Later (real tables)

| Child class | MIB spirit | Notes |
|-------------|------------|-------|
| `operium.interface` | ifTable | Tailscale + primary NIC |
| `operium.storage` | hrStorageTable | Fracta disk, Pi SD |
| `operium.peer` | neighbour tables | From `peer_nodes` |

### Explicit non-goals for default surface

- Full process tables  
- Per-core CPU bars  
- SNMP traps / INFORM  
- SET / reconfigure from La Nasa (P5+)

## 5. How La Nasa should use this

| UI block | Backing | MIB feeling |
|---------|---------|-------------|
| Head + badges | status + state.* | sysName / health LED |
| System chips | system.* | system + host resources scalars |
| Probes | status.probes | “Is the path green?” |
| Attributes | object.attributes + vocabulary | Scalar walk |
| Object tree | object.children | Conceptual table of services |
| Observations | /soma/observations | Current samples only |
| Cached badge (P4) | last-known file | Offline manager still shows last GET |

When adding a field to the zoom, ask:

> “Would this be a first-class object in a small custom MIB for this device class?”

If no, keep it in Raw JSON or status-only debug.

## 6. Storage stance for last-known (P4)

| Item | Location |
|------|----------|
| Live truth | ONA on each node |
| Last-known zoom pack | `rpi3-view:/srv/operium-edge-portal/cache/nodes/<host>.json` |
| Schema | `operium.edge-portal.node-cache.v1` |
| Writer | `/cgi-bin/node` on successful live pull; timer warmer |
| Reader | same CGI when live pull fails → `live:false`, `stale:true` |

No central TSDB. Cache is **projection on the manager host**, like an NMS “last poll” row.

## 7. Acceptance checks

- [x] Document maps SNMP groups → SOMA without requiring ASN.1  
- [x] Explicit default zoom attribute budget  
- [x] P4 last-known path named and schemed  
- [ ] Next ONA runtime pass adds load/memory polish only if still cheap  
- [ ] Interface/storage children only when a concrete operator pain appears  
