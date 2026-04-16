const CACHE_NAME = "axtask-offline-v1";
const OFFLINE_ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copied = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copied).catch(() => {
            // Ignore cache put failures for opaque/cross-origin responses.
          });
        });
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }),
  );
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {
        title: "AxTask reminder",
        body: event.data?.text() || "You have a new notification.",
      };
    }
  })();

  const title = payload.title || "AxTask";
  const options = {
    body: payload.body || "You have a new notification.",
    icon: payload.icon || "/branding/axtask-logo.png",
    badge: payload.badge || "/branding/axtask-logo.png",
    tag: payload.meta?.type === "adherence" ? "axtask-adherence" : undefined,
    data: {
      url: payload.url || "/planner",
      meta: payload.meta || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/planner";

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = clients.find((client) => client.url.includes(self.location.origin));
    if (existingClient) {
      existingClient.focus();
      existingClient.navigate(targetUrl);
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
