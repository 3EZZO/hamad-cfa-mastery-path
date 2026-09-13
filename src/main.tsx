import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import { registerProject202ServiceWorker } from "./lib/pwa";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
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
