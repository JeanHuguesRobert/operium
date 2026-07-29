// Operium edge portal Firefox profile — no crash/session restore dialogs.
// Applied as user.js in the dedicated profile "operium-edge".

// Never offer "restore previous session" after hard reboot / kill -9.
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.resume_session_once", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("toolkit.startup.max_resumed_crashes", -1);

// Start clean; opener always passes the portal URL on the command line.
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "http://127.0.0.1/");
user_pref("browser.startup.homepage_override.mstone", "ignore");

// Less friction on a small edge display.
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.tabs.warnOnOpen", false);
user_pref("browser.warnOnQuit", false);
user_pref("browser.sessionstore.max_tabs_undo", 0);
user_pref("browser.sessionstore.max_windows_undo", 0);

// Quiet first-run / update nags (best-effort; some are build-dependent).
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.messaging-system.whatsNewPanel.enabled", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
