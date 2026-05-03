export type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

export function detectInstallPlatform(userAgent?: string): InstallPlatform {
  const ua =
    (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : ""))
      .toLowerCase();

  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return "ios";
  }
  if (ua.includes("android")) {
    return "android";
  }
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) {
    return "desktop";
  }
  return "unknown";
}

export function getInstallInstructions(platform: InstallPlatform): string[] {
  switch (platform) {
    case "ios":
      return [
        "Open this app in Safari.",
        "Tap the Share button.",
        "Choose Add to Home Screen.",
      ];
    case "android":
      return [
        "Open browser menu (three dots).",
        "Tap Add to Home screen or Install app.",
        "Confirm installation.",
      ];
    case "desktop":
      return [
        "Look for the install icon in the address bar.",
        "Or open browser menu and choose Install app.",
        "Confirm to add a desktop shortcut.",
      ];
    default:
      return [
        "Open your browser menu.",
        "Choose Add to Home screen or Install app.",
        "Confirm to create a shortcut.",
      ];
  }
}
