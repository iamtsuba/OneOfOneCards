// Pré-rendu de la page d'accueil : écrit dans dist/<env>/index.html le HTML de l'écran de connexion et de la présentation du jeu,
// pour que les moteurs de recherche et les aperçus de partage lisent du vrai texte sans exécuter de JavaScript. React remplace ce
// contenu dès qu'il démarre (createRoot vide le conteneur). Appelé par scripts/post-build.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Variables VITE_* d'un fichier .env.<env> (mêmes valeurs que celles injectées par Vite dans le site compilé)
export function readEnvFile(root, env) {
  const file = path.join(root, `.env.${env}`)
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

// Renvoie le nombre de caractères de HTML insérés. Lève une erreur claire si quelque chose manque.
export async function prerender({ root, env, dir }) {
  const indexFile = path.join(dir, 'index.html')
  const html = fs.readFileSync(indexFile, 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error('<div id="root"></div> introuvable dans index.html')
  if (!fs.existsSync(path.join(root, 'src/components/Auth.jsx'))) throw new Error('src/components/Auth.jsx introuvable')

  const { build } = await import('esbuild')
  const require = createRequire(path.join(root, 'package.json'))
  const React = require('react')
  const { renderToString } = require('react-dom/server')

  // Le paquet est construit DANS le projet (pour retrouver react et supabase-js dans node_modules) puis supprimé
  const tmp = fs.mkdtempSync(path.join(root, 'dist', '.prerender-'))
  try {
    const vars = readEnvFile(root, env)
    await build({
      stdin: { contents: "export { default as Auth } from './src/components/Auth.jsx'", resolveDir: root, loader: 'js' },
      bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(tmp, 'bundle.mjs'),
      external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
      define: { 'import.meta.env': JSON.stringify({ ...vars, MODE: env, DEV: false, PROD: true, SSR: true, BASE_URL: './' }) },
      logLevel: 'silent',
    })
    const { Auth } = await import(pathToFileURL(path.join(tmp, 'bundle.mjs')).href)
    const markup = renderToString(React.createElement(Auth))
    if (!/<h1[ >]/.test(markup)) throw new Error('le rendu ne contient pas de titre <h1>')
    fs.writeFileSync(indexFile, html.replace('<div id="root"></div>', `<div id="root"><div class="prerendered">${markup}</div></div>`))
    return markup.length
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
