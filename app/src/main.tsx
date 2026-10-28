import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './lib/auth'
import { applyStoredTheme } from './lib/theme'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/bricolage-grotesque/wght.css'
import './index.css'

applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
