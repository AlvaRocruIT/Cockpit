import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./styles/index.css";
import ".styles/app.css";
import ".styles/font.css";
import ".styles/tailwind.css";
import ".styles/theme.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
