import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import { installGlobalErrorCapture } from "./lib/errorReport";
import { registerProject202ServiceWorker } from "./lib/pwa";
import "./styles.css";

installGlobalErrorCapture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary scope="app" variant="app">
      <App />
    </ErrorBoundary>
    <PwaInstallPrompt />
  </StrictMode>,
);

if (import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void registerProject202ServiceWorker().catch((error: unknown) => {
      console.warn("The mastery tracker offline shell could not be registered.", error);
    });
  });
}
