import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : l'app fonctionne sur https://<user>.github.io/<repo>/ comme sur un domaine perso
export default defineConfig({
  plugins: [react()],
  base: './',
})
