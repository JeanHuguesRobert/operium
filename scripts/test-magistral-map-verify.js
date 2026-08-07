#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifyPath = path.join(root, "scripts/ops/verify-magistral-coding-map.js");

// Dynamic import of the verify module's pure function via spawning is heavy;
// re-implement minimal check by importing after making verifyMaps exportable.
const mod = await import(pathToFileURL(verifyPath).href);
const { verifyMaps } = mod;

const profile = [
  {
    id: "coding-grok-fast",
    url: "http://100.122.121.68:8793/v1/chat/completions",
    model: "grok",
    tier: "fast",
    apiKeyEnv: "COGENTIA_API_KEY",
  },
  {
    id: "openai-fast",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    tier: "fallback",
  },
];

const goodLive = JSON.parse(JSON.stringify(profile));
const good = verifyMaps(profile, goodLive, {});
assert.equal(good.ok, true, JSON.stringify(good.failed));

const badLive = [
  {
    id: "coding-grok-fast",
    url: "http://100.122.121.68:8793/v1/chat/completions",
    model: "grok",
    tier: "fallback",
    apiKeyEnv: "COGENTIA_API_KEY",
  },
  {
    id: "openai-fast",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    tier: "fast",
  },
];
const bad = verifyMaps(profile, badLive, {});
assert.equal(bad.ok, false);
assert.ok(bad.failed.includes("live.coding-grok-fast.tier"));
// openai can be fast only when no coding-* is fast — still a tier mismatch on coding node
assert.ok(bad.failed.some((id) => id.includes("tier")));

// Real profile file self-check
const profilePath = path.join(
  root,
  "profiles",
  "magistral-map.coding-agents.v1.json"
);
const realProfile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
const self = verifyMaps(realProfile, null, { profilePath });
assert.equal(self.ok, true, JSON.stringify(self.failed));

// Live-as-profile should pass
const liveMatch = verifyMaps(realProfile, realProfile, { profilePath });
assert.equal(liveMatch.ok, true);

console.log(
  JSON.stringify(
    {
      ok: true,
      tests: [
        "good_live_match",
        "detect_inverted_tiers",
        "real_profile_invariants",
        "identity_live",
      ],
    },
    null,
    2
  )
);
