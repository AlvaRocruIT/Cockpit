import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./styles/index.css";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/tailwind.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
