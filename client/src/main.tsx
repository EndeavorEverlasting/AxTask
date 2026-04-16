import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function injectReplitDevBanner() {
  try {
    const h = window.location.hostname;
    if (!/\.replit\.dev$/i.test(h) && !/\.replit\.app$/i.test(h)) return;
    const s = document.createElement("script");
    s.src = "https://replit.com/public/js/replit-dev-banner.js";
    s.async = true;
    // SRI sha384 — verified 2026-04-07 against https://replit.com/public/js/replit-dev-banner.js
    s.integrity = "sha384-Ot/Tu9WFHBmxe79uTL9kRtiU415hQIn1LnPczUWhACVAUsgp4rgHLuP+D6egBdmV";
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      console.warn("[axtask] Replit dev banner script failed to load or SRI mismatch");
    };
    document.body.appendChild(s);
  } catch {
    // ignore banner failures
  }
}

createRoot(document.getElementById("root")!).render(<App />);

if (typeof window !== "undefined") {
  injectReplitDevBanner();
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch(() => {
        // Service worker registration can fail in some dev/browser contexts.
      });
  });
}
