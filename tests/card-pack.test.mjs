// Rend la carte (styles Simple et FullArt) et le booster (nom en haut, image au centre) avec de vraies données, sans navigateur.
//   node tests/card-pack.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-cardpack-'))
await build({
  stdin: { contents: "export { default as Card } from './src/components/Card.jsx'; export { default as Pack, packTitle } from './src/components/Pack.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Card, Pack, packTitle, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const ultra = { id: 'ultra', name: 'Ultra Rare', kind: 'range', color: '#e11d48', color2: '#9f1239', text_color: '#fff' }
const types = [{ id: 1, name: 'Chat va ?', image: '🐱' }, { id: 2, name: 'Chat photo', image: 'https://exemple.test/chat.png' }]
// Le type 1 est FullArt en Ultra Rare seulement ; le type 2 est Simple partout
const catalog = {
  typeMap: Object.fromEntries(types.map((t) => [t.id, t])),
  cardStyle: (typeId, base) => (typeId === 1 && base === 'ultra' ? 'fullart' : 'simple'),
  numberHidden: (typeId, base, series) => typeId === 1 && series === 50, checklist: () => ({ no: 1, total: 2, secret: false }),
}
const wrap = (el) => React.createElement(GameContext.Provider, { value: { catalog } }, el)
const card = (props) => renderToStaticMarkup(wrap(React.createElement(Card, { rarity: ultra, size: 'md', ...props })))

// ---------- Carte
const fa = card({ typeId: 1, base: 'ultra', series: 10, number: 3 })
const si = card({ typeId: 1, base: 'common', series: 10, number: 3 })
ok('carte FullArt : classe « fullart » et annoncée « FullArt » aux lecteurs d’écran', /class="card md fullart/.test(fa) && /FullArt/.test(fa.match(/aria-label="[^"]*"/)[0]))
ok('carte Simple : pas de classe « fullart » (le dessin d’origine)', !/fullart/.test(si) && !/FullArt/.test(si))
ok('le style dépend de la rareté de base : même type, Ultra Rare en FullArt et Commune en Simple', /fullart/.test(fa) && !/fullart/.test(si))
ok('FullArt : mêmes éléments que Simple (rareté, numéro, image, nom, numéro de checklist) pour les styler par-dessus', ['card-rarity', 'card-num', 'card-art', 'card-type', 'card-setno'].every((c) => fa.includes(c)))
ok('FullArt : un numéro masqué le reste', !/card-num/.test(card({ typeId: 1, base: 'ultra', series: 50, number: 3 })) && /nonum/.test(card({ typeId: 1, base: 'ultra', series: 50, number: 3 })))
ok('FullArt avec une image https : l’image est celle du type', /<img class="type-art ?"[^>]*src="https:\/\/exemple.test\/chat.png"/.test(card({ typeId: 2, base: 'ultra', series: 10, number: 3, styleName: 'fullart' })))
ok('FullArt « à moi » et « déjà tirée » : les états restent annoncés', /à toi/.test(card({ typeId: 1, base: 'ultra', series: 10, number: 3, tone: 'mine' })) && /fullart/.test(card({ typeId: 1, base: 'ultra', series: 10, number: 3, tone: 'taken' })))
// Aperçu hors du jeu (console admin) : sans catalogue, avec type et style donnés
const solo = (props) => renderToStaticMarkup(React.createElement(Card, { rarity: ultra, series: 50, number: 3, size: 'md', ...props }))
ok('aperçu sans catalogue : le style demandé et le type donné sont utilisés', /fullart/.test(solo({ type: types[0], styleName: 'fullart' })) && !/fullart/.test(solo({ type: types[0], styleName: 'simple' })) && /🐱/.test(solo({ type: types[0], styleName: 'fullart' })))
ok('sans catalogue ni style : Simple par défaut', !/fullart/.test(solo({ type: types[0] })))

// ---------- Booster
const pack = (props) => renderToStaticMarkup(React.createElement(Pack, props))
const cat = { name: 'Années 80', color: '#ffd9b0', color2: '#f29a45', text_color: '#3d1f00', image: '' }
const p0 = pack({ category: cat })
ok('booster : le nom de la catégorie est en haut, au-dessus de l’image centrale et de « 1/1 Cards »', p0.indexOf('Années 80') > 0 && p0.indexOf('Années 80') < p0.indexOf('pack-window') && p0.indexOf('pack-window') < p0.indexOf('1/1 Cards'))
ok('booster sans image : « 1/1 » au centre, aucune image', /class="pack-mark"/.test(p0) && !/<image/.test(p0) && !/pack-emoji/.test(p0))
const pe = pack({ category: { ...cat, image: '🕹️' } })
ok('booster avec un emoji : l’emoji est au centre à la place du « 1/1 »', /class="pack-emoji"[^>]*>🕹️</.test(pe) && !/pack-mark/.test(pe))
const ph = pack({ category: { ...cat, image: 'https://exemple.test/b.png' } })
ok('booster avec une image https : elle est au centre, découpée aux coins arrondis', /<image class="pack-image" href="https:\/\/exemple.test\/b.png"/.test(ph) && /clip-path="url\(#pk-win-[A-Za-z0-9]+\)"/.test(ph) && !/pack-mark/.test(ph))
ok('booster avec une image intégrée (téléversée) : affichée', /<image class="pack-image" href="data:image\/webp;base64,AAAA"/.test(pack({ category: { ...cat, image: 'data:image/webp;base64,AAAA' } })))
ok('booster : les couleurs de la catégorie sont conservées', /--pk-a:#ffd9b0/.test(p0) && /--pk-text:#3d1f00/.test(p0))
const pg = pack({ golden: true, category: { ...cat, image: '🕹️' } })
ok('booster doré : « Booster doré » en haut et une étoile au centre (l’image de la catégorie est ignorée)', pg.indexOf('Booster doré') < pg.indexOf('pack-window') && /<path d="M12 2\.2l2\.9/.test(pg) && !/🕹️/.test(pg))
ok('booster sans catégorie : titre « 1/1 Cards » et « 1/1 » au centre', /pack-title[^>]*>1\/1 Cards</.test(pack({})) && /pack-mark/.test(pack({})))
ok('booster : texte protégé (un nom avec des chevrons n’injecte rien)', !/<script/.test(pack({ category: { ...cat, name: '<script>x</script>' } })))

// Plusieurs boosters sur une même page (aperçus de l'admin) : aucun identifiant SVG en double, sinon tous prendraient le dégradé du premier
const two = renderToStaticMarkup(React.createElement('div', null, React.createElement(Pack, { category: cat }), React.createElement(Pack, { category: { ...cat, color: '#c9f0c0', name: 'Autre' } })))
const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
ok('deux boosters sur la même page : aucun identifiant SVG en double', ids.length >= 8 && new Set(ids).size === ids.length)
ok('chaque booster référence ses propres dégradés et découpes', [...two.matchAll(/url\(#([^)]+)\)/g)].every((m) => ids.includes(m[1])))
ok('titre : non resserré par défaut (scale 1), le resserrement se fait à la mesure dans le navigateur', /translate\(120 78\) scale\(1 1\)/.test(p0))

// Titre : une seule ligne, taille adaptée, tronqué au-delà de 22 caractères
const t1 = packTitle('Années 80'), t2 = packTitle('CHATTRAPEZ LES TOUS'), t3 = packTitle('Une catégorie au nom vraiment très très long')
ok('titre court : grande taille (30)', t1.text === 'Années 80' && t1.size === 30)
ok('titre moyen : taille réduite pour tenir sur la largeur (≈ 16)', t2.size < 30 && t2.size >= 15 && t2.text === 'CHATTRAPEZ LES TOUS')
ok('titre trop long : tronqué avec « … » (22 caractères au plus) et taille minimale', t3.text.length <= 22 && t3.text.endsWith('…') && t3.size === 15)
ok('titre : la largeur estimée ne dépasse jamais la zone (≤ 200)', ['A', 'Années 80', 'CHATTRAPEZ LES TOUS', 'Une catégorie au nom vraiment très très long'].every((n) => { const t = packTitle(n); return t.text.length * 0.62 * t.size <= 215 }))
ok('titre vide : « 1/1 Cards »', packTitle('  ').text === '1/1 Cards' && packTitle(null).text === '1/1 Cards')

console.log(bad ? `\n${bad} ÉCHEC(S)` : '\nCarte et booster : tous les contrôles sont passés.')
process.exit(bad ? 1 : 0)
