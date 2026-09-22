import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import UpdateToast from "./components/UpdateToast";
import { installGlobalErrorCapture } from "./lib/errorReport";
import { registerProject202ServiceWorker } from "./lib/pwa";
import "./styles.css";

installGlobalErrorCapture();

// Registered after load so the first paint never competes with the worker;
// the update toast waits on the same promise.
const registration: Promise<ServiceWorkerRegistration | null> = import.meta.env.PROD
  ? new Promise((resolve) => {
      window.addEventListener("load", () => {
        registerProject202ServiceWorker()
          .then(resolve)
          .catch((error: unknown) => {
            console.warn("The mastery tracker offline shell could not be registered.", error);
            resolve(null);
          });
      });
    })
  : Promise.resolve(null);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary scope="app" variant="app">
      <App />
    </ErrorBoundary>
    <PwaInstallPrompt />
    <UpdateToast registration={registration} />
  </StrictMode>,
);
