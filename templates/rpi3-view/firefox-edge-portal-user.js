// Operium edge portal Firefox profile — no profile picker, no session restore.
// Applied as user.js under ~/.mozilla/firefox/operium-edge.profile/

// Never offer "restore previous session" after hard reboot / kill -9.
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.resume_session_once", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("toolkit.startup.max_resumed_crashes", -1);

// Start clean; opener always passes the portal URL on the command line.
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "http://127.0.0.1/");
user_pref("browser.startup.homepage_override.mstone", "ignore");

// Direct connection — no proxy, no HTTPS-only upgrade of http://127.0.0.1/
user_pref("network.proxy.type", 0);
user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1, ::1");
user_pref("network.proxy.allow_hijacking_localhost", false);
user_pref("dom.security.https_only_mode", false);
user_pref("dom.security.https_only_mode_pbm", false);
user_pref("dom.security.https_only_mode_ever_enabled", false);
user_pref("network.dns.disableIPv6", true);

// Less friction on a small edge display / first run.
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.tabs.warnOnOpen", false);
user_pref("browser.warnOnQuit", false);
user_pref("browser.sessionstore.max_tabs_undo", 0);
user_pref("browser.sessionstore.max_windows_undo", 0);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.messaging-system.whatsNewPanel.enabled", false);
user_pref("trailhead.firstrun.didSeeAboutWelcome", true);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("app.normandy.first_run", false);
