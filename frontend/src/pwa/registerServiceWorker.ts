export function registerServiceWorker() {
  if (
    !import.meta.env.PROD ||
    window.location.protocol !== "https:" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        if (registration.waiting) {
          window.dispatchEvent(new CustomEvent("drop-den-sw-update"));
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          installingWorker?.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              window.dispatchEvent(new CustomEvent("drop-den-sw-update"));
            }
          });
        });
      })
      .catch((error) => {
        console.error("Drop Den service worker registration failed", error);
      });
  });
}
