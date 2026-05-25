import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/tailwind.css'
import app from './app'

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
