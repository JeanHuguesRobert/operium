import { spawn } from "node:child_process";

/** CREATE_NO_WINDOW — avoid visible console when spawning from a service or scheduler */
export const CREATE_NO_WINDOW = 0x08000000;

/**
 * Spawn a child process without allocating a visible console on Windows.
 * Prefer stdio "ignore" on win32 — piped stdio can still flash when the parent is a service.
 */
export function spawnHeadless(command, args, options = {}) {
  const win32 = process.platform === "win32";
  const stdio = options.stdio ?? (win32 ? "ignore" : ["ignore", "pipe", "pipe"]);
  const spawnOptions = {
    ...options,
    stdio,
    windowsHide: options.windowsHide !== false,
    detached: options.detached ?? false,
  };
  if (win32) {
    const existing = Number(spawnOptions.creationFlags || 0);
    spawnOptions.creationFlags = existing | CREATE_NO_WINDOW;
  }
  return spawn(command, args, spawnOptions);
}