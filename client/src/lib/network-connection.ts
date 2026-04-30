export type NetworkConnectionKind = "offline" | "cellular" | "wifi" | "online" | "unknown";

export type NetworkConnectionStatus = {
  isOnline: boolean;
  kind: NetworkConnectionKind;
  label: string;
  shouldWarn: boolean;
  warningMessage?: string;
  effectiveType?: string;
  downlink?: number;
};

type BrowserConnectionLike = {
  type?: string;
  effectiveType?: string;
  downlink?: number;
};

const CELLULAR_TYPES = new Set(["cellular", "3g", "4g", "5g", "2g"]);
const WIFI_TYPES = new Set(["wifi", "ethernet", "wimax"]);

function normalize(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
}

export function classifyNetworkConnection(input: {
  isOnline?: boolean;
  connection?: BrowserConnectionLike | null;
}): NetworkConnectionStatus {
  const isOnline = input.isOnline ?? true;
  const connection = input.connection ?? undefined;
  const type = normalize(connection?.type);
  const effectiveType = normalize(connection?.effectiveType);
  const downlink = typeof connection?.downlink === "number" ? connection.downlink : undefined;

  if (!isOnline) {
    return {
      isOnline: false,
      kind: "offline",
      label: "Offline",
      shouldWarn: false,
      effectiveType,
      downlink,
    };
  }

  if (type && CELLULAR_TYPES.has(type)) {
    return {
      isOnline: true,
      kind: "cellular",
      label: "Cellular data",
      shouldWarn: true,
      warningMessage: "You appear to be on cellular data. AxTask may use your data plan until you reconnect to Wi-Fi.",
      effectiveType,
      downlink,
    };
  }

  if (type && WIFI_TYPES.has(type)) {
    return {
      isOnline: true,
      kind: "wifi",
      label: type === "ethernet" ? "Ethernet" : "Wi-Fi",
      shouldWarn: false,
      effectiveType,
      downlink,
    };
  }

  if (effectiveType && CELLULAR_TYPES.has(effectiveType)) {
    return {
      isOnline: true,
      kind: "cellular",
      label: `${effectiveType.toUpperCase()} connection`,
      shouldWarn: true,
      warningMessage: "You may be on metered data. AxTask may use your data plan until you reconnect to Wi-Fi.",
      effectiveType,
      downlink,
    };
  }

  return {
    isOnline: true,
    kind: type ? "online" : "unknown",
    label: type ? "Online" : "Connection unknown",
    shouldWarn: false,
    effectiveType,
    downlink,
  };
}

export function getBrowserNetworkConnection(): BrowserConnectionLike | null {
  if (typeof navigator === "undefined") return null;
  const maybeNavigator = navigator as Navigator & {
    connection?: BrowserConnectionLike;
    mozConnection?: BrowserConnectionLike;
    webkitConnection?: BrowserConnectionLike;
  };
  return maybeNavigator.connection ?? maybeNavigator.mozConnection ?? maybeNavigator.webkitConnection ?? null;
}
