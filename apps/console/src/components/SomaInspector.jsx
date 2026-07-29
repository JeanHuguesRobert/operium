import { useEffect, useMemo, useState } from "react";

export function SomaInspector({ object, vocabulary }) {
  const objects = useMemo(() => indexObjects(object), [object]);
  const [selectedId, setSelectedId] = useState(object?.id || null);

  useEffect(() => {
    setSelectedId(object?.id || null);
  }, [object?.id]);

  if (!object) {
    return <p className="text-sm text-ops-muted">No SOMA object projection is available.</p>;
  }

  const selected = objects.get(selectedId) || object;
  const definitions = vocabulary?.attributes || {};
  const breadcrumbs = buildBreadcrumbs(object, selected.id);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-ops-muted" aria-label="SOMA containment">
        {breadcrumbs.map((item, index) => (
          <span key={item.id} className="flex items-center gap-1">
            {index ? <span>/</span> : null}
            <button
              type="button"
              className="hover:text-ops-accent"
              onClick={() => setSelectedId(item.id)}
            >
              {objectLabel(item)}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{objectLabel(selected)}</h3>
          <p className="font-mono text-xs text-ops-muted">{selected.id}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-ops-accent">{selected.class}</div>
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {(selected.facets || []).map(facet => (
              <span key={facet} className="rounded-full border border-ops-border px-2 py-0.5 text-xs text-ops-muted">
                {facet}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(selected.attributes || {}).map(([name, occurrence]) => (
          <AttributeCard
            key={name}
            name={name}
            occurrence={occurrence}
            definition={definitions[name]}
          />
        ))}
      </div>

      {(selected.children || []).length ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ops-muted">
            Contained objects
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {selected.children.map(child => (
              <button
                key={child.id}
                type="button"
                onClick={() => setSelectedId(child.id)}
                className="rounded-md border border-ops-border bg-black/10 px-3 py-2 text-left hover:border-ops-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{objectLabel(child)}</span>
                  <StateDot value={attributeValue(child.attributes?.["state.operational"])} />
                </div>
                <div className="mt-1 font-mono text-xs text-ops-muted">{child.class}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-md border border-ops-border/70 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ops-muted">
          Raw SOMA object
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto text-xs text-ops-muted">
          {JSON.stringify(selected, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function AttributeCard({ name, occurrence, definition = {} }) {
  const observed = isObservation(occurrence);
  const value = observed ? occurrence.value : occurrence;
  const unit = occurrence?.unit || definition.unit || null;
  const behaviour = definition.behaviour_type || (observed ? "Observation" : "Value");

  return (
    <div className="rounded-md border border-ops-border/70 bg-black/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="break-all font-mono text-xs text-ops-muted">{name}</div>
        <span className="rounded bg-ops-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ops-muted">
          {behaviour}
        </span>
      </div>
      <div className="mt-2 break-words text-lg font-medium">{formatValue(value, unit)}</div>
      {definition.semantics ? (
        <p className="mt-1 text-xs text-ops-muted">{definition.semantics}</p>
      ) : null}
      {observed ? (
        <div className="mt-2 space-y-0.5 text-[11px] text-ops-muted">
          <div>{formatAge(occurrence.observed_at)}</div>
          <div className="truncate" title={occurrence.source}>source: {occurrence.source || "unknown"}</div>
          {occurrence.quality ? <div>quality: {occurrence.quality}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function indexObjects(root) {
  const index = new Map();
  function visit(object) {
    if (!object?.id) return;
    index.set(object.id, object);
    for (const child of object.children || []) visit(child);
  }
  visit(root);
  return index;
}

function buildBreadcrumbs(root, selectedId) {
  const path = [];
  function visit(object) {
    if (!object) return false;
    path.push(object);
    if (object.id === selectedId) return true;
    for (const child of object.children || []) {
      if (visit(child)) return true;
    }
    path.pop();
    return false;
  }
  visit(root);
  return path.length ? path : [root];
}

function objectLabel(object) {
  return attributeValue(object?.attributes?.["core.user-label"])
    || object?.id?.split(/[/:]/).filter(Boolean).at(-1)
    || "managed object";
}

function attributeValue(occurrence) {
  return isObservation(occurrence) ? occurrence.value : occurrence;
}

function isObservation(value) {
  return Boolean(value && typeof value === "object" && "value" in value && "observed_at" in value);
}

function formatValue(value, unit) {
  if (value == null) return "—";
  if (unit === "byte" && Number.isFinite(Number(value))) return formatBytes(Number(value));
  if (unit === "second" && Number.isFinite(Number(value))) return formatDuration(Number(value));
  if (unit === "millisecond" && Number.isFinite(Number(value))) return `${Number(value).toLocaleString()} ms`;
  if (unit === "percent" && Number.isFinite(Number(value))) return `${Number(value).toLocaleString()}%`;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = Math.max(0, value);
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${value % 60}s`;
  return `${value}s`;
}

function formatAge(timestamp) {
  const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000));
  if (!Number.isFinite(ageSeconds)) return "observation time unknown";
  return `observed ${formatDuration(ageSeconds)} ago`;
}

function StateDot({ value }) {
  const ok = value === "enabled" || value === "online" || value === "healthy";
  return (
    <span className={ok ? "text-ops-ok" : "text-ops-warn"}>
      {ok ? "●" : "○"} {value || "unknown"}
    </span>
  );
}
