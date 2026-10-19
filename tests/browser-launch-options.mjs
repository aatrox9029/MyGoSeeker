// Override only the executable; each suite still creates its own temporary profile.
export function browserLaunchOptions() {
  const executablePath = process.env.MGS_BROWSER_EXECUTABLE;
  return executablePath ? { channel: "chromium", executablePath } : { channel: "chromium" };
}
