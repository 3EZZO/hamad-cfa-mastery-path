import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import UpdateToast from "./components/UpdateToast";
import { installDepthMotion } from "./lib/depthMotion";
import { installGlobalErrorCapture } from "./lib/errorReport";
import { registerProject202ServiceWorker } from "./lib/pwa";
import "./styles.css";
import "./identity.css";
import "./typography.css";

installGlobalErrorCapture();
installDepthMotion();

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

// Development only: a local mock-test preview for the tutor review sheet. The
// DEV constant is false in production builds, so this import is removed there
// (verified by the build's private-content check).
const DevPaperPreview = import.meta.env.DEV ? lazy(() => import("./features/mockTests/DevPaperPreview")) : null;
const paperPreview = DevPaperPreview !== null && new URLSearchParams(window.location.search).has("paper-preview");

createRoot(document.getElementById("root")!).render(
  paperPreview && DevPaperPreview ? (
    <Suspense fallback={null}><DevPaperPreview /></Suspense>
  ) : (
    <StrictMode>
      <ErrorBoundary scope="app" variant="app">
        <App />
      </ErrorBoundary>
      <PwaInstallPrompt />
      <UpdateToast registration={registration} />
    </StrictMode>
  ),
);
