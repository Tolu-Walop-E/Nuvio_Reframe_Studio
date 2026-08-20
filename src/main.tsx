import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { InstallPage } from "./install/InstallPage.tsx";

const isInstallRoute =
  typeof window !== "undefined" &&
  (window.location.pathname === "/install" || window.location.pathname.startsWith("/install/"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isInstallRoute ? <InstallPage /> : <App />}</StrictMode>,
);
