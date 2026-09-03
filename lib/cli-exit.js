/**
 * Finish an Operium CLI command without calling process.exit().
 *
 * On Windows, Node 24's libuv can abort after fetch() or child_process with:
 *   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)
 *   file src\win\async.c, line 76
 *
 * Root cause is nodejs/node#56645: process.exit() short-circuits teardown while
 * undici / WorkerThreadsTaskRunner still uv_async_send() on a closing handle.
 * Tailscale status (execFile) plus HTTP probes in `operium up` hit that race.
 *
 * Workaround: set process.exitCode and return so the event loop drains.
 * Same policy as `operium node diagnose` (commit d8d8a73).
 *
 * Usage-error paths that have not opened native handles may still call
 * process.exit(); this helper is required after any probe, fetch, or spawn.
 */
export function finishCli(code = 0) {
  const n = Number(code);
  process.exitCode = Number.isFinite(n) ? n : 1;
}
