/**
 * Atomic single-key .env file helpers.
 * Never log secret values; callers may use fingerprint() for compare-only reports.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidEnvKey(key) {
  return KEY_PATTERN.test(String(key || ""));
}

export function readEnvKey(text, key) {
  const prefix = `${key}=`;
  const line = String(text).split(/\r?\n/).find((item) => item.startsWith(prefix));
  return line == null ? null : line.slice(prefix.length);
}

export function writeEnvKey(text, key, value, newline = "\n") {
  const lines = String(text).split(/\r?\n/);
  const prefix = `${key}=`;
  let replaced = false;
  const next = lines
    .map((line) => {
      if (!line.startsWith(prefix)) return line;
      if (replaced) return null;
      replaced = true;
      return `${prefix}${value}`;
    })
    .filter((line) => line != null);
  if (!replaced) {
    if (next.length && next.at(-1) !== "") next.push("");
    next.push(`${prefix}${value}`);
  }
  while (next.length > 1 && next.at(-1) === "" && next.at(-2) === "") next.pop();
  return `${next.join(newline).replace(new RegExp(`${escapeRegExp(newline)}+$`), "")}${newline}`;
}

export function detectNewline(text) {
  return String(text).includes("\r\n") ? "\r\n" : "\n";
}

/** SHA-256 of the secret value — compare only; do not treat as public. */
export function fingerprintValue(value) {
  if (value == null || value === "") return null;
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

/**
 * Read one key from a file. Returns { present, empty, value } — value for
 * in-process use only; never print.
 */
export function readKeyFromFile(filePath, key) {
  if (!isValidEnvKey(key)) {
    throw new Error("invalid_env_key");
  }
  if (!fs.existsSync(filePath)) {
    return { present: false, empty: true, value: null, path: path.resolve(filePath) };
  }
  const text = fs.readFileSync(filePath, "utf8");
  const value = readEnvKey(text, key);
  return {
    present: value != null,
    empty: value == null || value === "",
    value: value == null ? null : value,
    path: path.resolve(filePath),
  };
}

/**
 * Atomically set key=value in target file. Preserves mode and newline style.
 * @returns {{ changed: boolean, path: string }}
 */
export function syncKeyToFile(sourceValue, targetPath, key, options = {}) {
  if (!isValidEnvKey(key)) {
    throw new Error("invalid_env_key");
  }
  if (sourceValue == null || sourceValue === "") {
    throw new Error("source_key_missing");
  }
  if (options.dryRun) {
    const current = readKeyFromFile(targetPath, key);
    const changed =
      !current.present ||
      current.empty ||
      current.value !== sourceValue;
    return {
      changed,
      path: path.resolve(targetPath),
      dry_run: true,
      fingerprint: fingerprintValue(sourceValue),
      target_match:
        current.present && !current.empty
          ? current.value === sourceValue
          : false,
    };
  }

  const targetExists = fs.existsSync(targetPath);
  const targetText = targetExists ? fs.readFileSync(targetPath, "utf8") : "";
  const newline = detectNewline(targetText);
  const nextText = writeEnvKey(targetText, key, sourceValue, newline);
  const changed = nextText !== targetText;

  if (changed) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temp = `${targetPath}.operium-${process.pid}.tmp`;
    fs.writeFileSync(temp, nextText, {
      mode: targetExists ? undefined : 0o600,
    });
    if (targetExists) {
      const stat = fs.statSync(targetPath);
      fs.chmodSync(temp, stat.mode);
    }
    fs.renameSync(temp, targetPath);
  }

  return {
    changed,
    path: path.resolve(targetPath),
    dry_run: false,
    fingerprint: fingerprintValue(sourceValue),
    target_match: true,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
