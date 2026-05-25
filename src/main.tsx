import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/tailwind.css'
import App from './App'

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
