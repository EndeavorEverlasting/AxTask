import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./planner-ai-layout.css";
import { startSharedLongTaskAttributor } from "./lib/long-task-attributor";
import { startSharedAnimationBudget } from "./lib/animation-budget";

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
  // Attribute browser longtasks to the largest on-screen AxTask surface so
  // the admin Performance panel can show which part of the app is burning
  // main-thread time. Client-local; nothing is sent to the server.
  startSharedLongTaskAttributor();
  // Pause ambient rAF animations (orbs, count-ups, chips) on scroll, long
  // tasks, hidden tabs, or when the user prefers reduced motion. See
  // `client/src/lib/animation-budget.ts`.
  startSharedAnimationBudget();
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
