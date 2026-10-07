import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : les ressources sont relatives, l'app fonctionne à la racine d'un domaine (1o1cards.cc, pp.1o1cards.cc) comme dans un sous-dossier
export default defineConfig({
  plugins: [react()],
  base: './',
})
