// Operium edge portal Firefox profile (Pi edge home).
// Absolute -profile launch only — never -P name.

// Session / crash restore (hard reboot)
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.resume_session_once", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("toolkit.startup.max_resumed_crashes", -1);

// Startup
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "http://127.0.0.1:8794/");
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("trailhead.firstrun.didSeeAboutWelcome", true);
user_pref("browser.shell.checkDefaultBrowser", false);

// Network: do not invent "offline" when WAN is down; loopback must stay usable.
user_pref("network.proxy.type", 0);
user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1, ::1");
user_pref("network.proxy.allow_hijacking_localhost", false);
user_pref("network.manage-offline-status", false);
user_pref("browser.offline", false);
user_pref("network.trr.mode", 5);
user_pref("network.connectivity-service.enabled", false);
user_pref("network.dns.disableIPv6", true);
user_pref("dom.security.https_only_mode", false);
user_pref("dom.security.https_only_mode_pbm", false);
user_pref("dom.security.https_only_mode_ever_enabled", false);

// Friction
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.warnOnQuit", false);
user_pref("browser.sessionstore.max_tabs_undo", 0);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("app.normandy.first_run", false);
