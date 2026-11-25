import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import { App } from "./app";
import { ProveedorAuth } from "./auth";
import { Toaster } from "./ui";
import "./styles.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("No está el contenedor de la aplicación.");

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
        <ProveedorAuth>
          <App />
          <Toaster />
        </ProveedorAuth>
    </BrowserRouter>
  </StrictMode>,
);
