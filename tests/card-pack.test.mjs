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
  stdin: { contents: "export { default as Card } from './src/components/Card.jsx'; export { default as Pack, packTitle, bandLabel, bandColors } from './src/components/Pack.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Card, Pack, packTitle, bandLabel, bandColors, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
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
ok('booster : le nom de la collection est en haut, au-dessus de l’image centrale et de « 1/1 Cards »', p0.indexOf('Années 80') > 0 && p0.indexOf('Années 80') < p0.indexOf('pack-window') && p0.indexOf('pack-window') < p0.indexOf('1/1 Cards'))
ok('booster sans image : « 1/1 » au centre, aucune image', /class="pack-mark"/.test(p0) && !/<image/.test(p0) && !/pack-emoji/.test(p0))
const pe = pack({ category: { ...cat, image: '🕹️' } })
ok('booster avec un emoji : l’emoji est au centre à la place du « 1/1 »', /class="pack-emoji"[^>]*>🕹️</.test(pe) && !/pack-mark/.test(pe))
const ph = pack({ category: { ...cat, image: 'https://exemple.test/b.png' } })
ok('booster avec une image https : elle est au centre, découpée aux coins arrondis', /<image class="pack-image" href="https:\/\/exemple.test\/b.png"/.test(ph) && /clip-path="url\(#pk-win-[A-Za-z0-9]+\)"/.test(ph) && !/pack-mark/.test(ph))
ok('booster avec une image intégrée (téléversée) : affichée', /<image class="pack-image" href="data:image\/webp;base64,AAAA"/.test(pack({ category: { ...cat, image: 'data:image/webp;base64,AAAA' } })))
ok('booster : les couleurs de la collection sont conservées', /--pk-a:#ffd9b0/.test(p0) && /--pk-text:#3d1f00/.test(p0))
const pg = pack({ golden: true, category: { ...cat, image: '🕹️' } })
ok('booster Gold : le nom de la collection en haut et une étoile au centre (l’image de la collection est ignorée)', pg.indexOf(cat.name) > -1 && pg.indexOf(cat.name) < pg.indexOf('pack-window') && /<path d="M12 2\.2l2\.9/.test(pg) && !/🕹️/.test(pg))
ok('booster Gold sans collection : son nom en titre (« Gold » par défaut), jamais « Booster doré »', /pack-title[^>]*>Gold</.test(pack({ golden: true })) && /pack-title[^>]*>Palier</.test(pack({ golden: true, label: 'Palier' })) && !/Booster doré/.test(pack({ golden: true })))
ok('booster sans collection : titre « 1/1 Cards » et « 1/1 » au centre', /pack-title[^>]*>1\/1 Cards</.test(pack({})) && /pack-mark/.test(pack({})))
ok('booster : texte protégé (un nom avec des chevrons n’injecte rien)', !/<script/.test(pack({ category: { ...cat, name: '<script>x</script>' } })))

// Plusieurs boosters sur une même page (aperçus de l'admin) : aucun identifiant SVG en double, sinon tous prendraient le dégradé du premier
const two = renderToStaticMarkup(React.createElement('div', null, React.createElement(Pack, { category: cat }), React.createElement(Pack, { category: { ...cat, color: '#c9f0c0', name: 'Autre' } })))
const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
ok('deux boosters sur la même page : aucun identifiant SVG en double', ids.length >= 8 && new Set(ids).size === ids.length)
ok('chaque booster référence ses propres dégradés et découpes', [...two.matchAll(/url\(#([^)]+)\)/g)].every((m) => ids.includes(m[1])))
ok('titre : non resserré par défaut (scale 1), le resserrement se fait à la mesure dans le navigateur', /translate\(120 78\) scale\(1 1\)/.test(p0))

// Titre : une seule ligne, taille adaptée, tronqué au-delà de 22 caractères
const t1 = packTitle('Années 80'), t2 = packTitle('CHATTRAPEZ LES TOUS'), t3 = packTitle('Une collection au nom vraiment très très long')
ok('titre court : grande taille (30)', t1.text === 'Années 80' && t1.size === 30)
ok('titre moyen : taille réduite pour tenir sur la largeur (≈ 16)', t2.size < 30 && t2.size >= 15 && t2.text === 'CHATTRAPEZ LES TOUS')
ok('titre trop long : tronqué avec « … » (22 caractères au plus) et taille minimale', t3.text.length <= 22 && t3.text.endsWith('…') && t3.size === 15)
ok('titre : la largeur estimée ne dépasse jamais la zone (≤ 200)', ['A', 'Années 80', 'CHATTRAPEZ LES TOUS', 'Une collection au nom vraiment très très long'].every((n) => { const t = packTitle(n); return t.text.length * 0.62 * t.size <= 215 }))
ok('titre vide : « 1/1 Cards »', packTitle('  ').text === '1/1 Cards' && packTitle(null).text === '1/1 Cards')

// ---- nom du booster sur la bande et halo de lumière
const band = (props) => (pack({ category: cat, ...props }).match(/<text class="pack-band"[^>]*>([^<]*)<\/text>/) || [])[1]
ok('bande du bas : « 1/1 Cards » par défaut (aucun nom de booster connu), y compris nom vide ou blanc', band({}) === '1/1 Cards' && band({ label: null }) === '1/1 Cards' && band({ label: '   ' }) === '1/1 Cards')
ok('bande du bas : le nom du booster à la place de « 1/1 Cards » (Standard, OneMore, Art Rare assuré)', band({ label: 'Standard' }) === 'Standard' && band({ label: 'OneMore' }) === 'OneMore' && band({ label: 'Art Rare assuré' }) === 'Art Rare assuré' && !/1\/1 Cards/.test(pack({ category: cat, label: 'Standard' })))
ok('bande du bas : le titre de la collection en haut et le « 1/1 » du centre restent', /Années 80/.test(pack({ category: cat, label: 'Standard' })) && /class="pack-mark"/.test(pack({ category: cat, label: 'Standard' })))
ok('bande du bas : un nom trop long est tronqué (18 caractères au plus, « … ») et le texte rétrécit', bandLabel('Un booster au nom démesurément long').text.length <= 18 && bandLabel('Un booster au nom démesurément long').text.endsWith('…') && bandLabel('Standard').size === 22 && bandLabel('Un booster au nom démesurément long').size < 22 && bandLabel('Un booster au nom démesurément long').size >= 12)
ok('bande du bas : la largeur estimée ne dépasse jamais la bande (≤ 190)', ['Standard', 'OneMore', 'Art Rare assuré', 'Récompense Gold!!', 'X'.repeat(40)].every((n) => { const b = bandLabel(n); return b.text.length * 0.6 * b.size <= 190 + 1 }))
ok('nom du booster : le HTML est échappé (jamais interprété)', band({ label: '<b>x</b>' }) === '&lt;b&gt;x&lt;/b&gt;')
const wrapClass = (props) => (pack({ category: cat, ...props }).match(/<div class="pack-wrap ([^"]*)"/) || [])[1]
ok('halo : un paquet sans halo (aucun, absent ou inconnu) n\'a aucune classe de halo', ['none', undefined, null, '', 'laser', 'GOLD'].every((g) => !/glow/.test(wrapClass({ glow: g }))))
ok('halo : chacun des 7 halos ajoute « has-glow glow-<nom> » autour du paquet', ['gold', 'silver', 'red', 'blue', 'green', 'purple', 'rainbow'].every((g) => new RegExp(`has-glow glow-${g}$`).test(wrapClass({ glow: g }).trim())))
ok('halo : pas de halo sur un paquet éteint (plus de boosters) ni sur le booster Gold (qui a déjà le sien)', !/glow/.test(wrapClass({ glow: 'gold', dim: true })) && !/has-glow/.test(wrapClass({ glow: 'gold', golden: true })) && /dim/.test(wrapClass({ glow: 'gold', dim: true })))
ok('halo : se combine avec les phases d\'ouverture (shake, tear)', /shake .*has-glow glow-gold/.test(wrapClass({ glow: 'gold', phase: 'shake' })) && /tear .*has-glow glow-purple/.test(wrapClass({ glow: 'purple', phase: 'tear' })))
ok('halo : décoratif (le paquet reste masqué aux lecteurs d\'écran)', /aria-hidden="true"/.test(pack({ category: cat, glow: 'gold' })))
{
  const css = (await import('node:fs')).readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  ok('CSS : une couleur pour chaque halo, l\'animation du halo, l\'arc-en-ciel animé et le respect de « réduire les animations »', ['gold', 'silver', 'red', 'blue', 'green', 'purple'].every((g) => new RegExp(`\\.glow-${g} \\{ --glow: #`).test(css)) && /@keyframes packhalo/.test(css) && /@keyframes packrainbow/.test(css) && /prefers-reduced-motion: reduce\) \{ \.pack-wrap\.has-glow svg/.test(css))
}
// ---- couleur de la bande du bas = couleur réglée sur le booster
const bandVar = (props) => ((pack({ category: cat, ...props }).match(/class="pack-wrap[^"]*" style="([^"]*)"/) || [])[1] ?? '')
ok('couleur du booster : la bande du bas la prend (violet, rouge…)', /--pk-band:#7c3aed/.test(bandVar({ color: '#7c3aed' })) && /--pk-band:#e8452e/.test(bandVar({ color: '#e8452e' })))
ok('texte de la bande lisible : blanc sur une couleur foncée, foncé sur une couleur claire (jaune, argent)', /--pk-bandtext:#ffffff/.test(bandVar({ color: '#7c3aed' })) && /--pk-bandtext:#14173f/.test(bandVar({ color: '#fde68a' })) && /--pk-bandtext:#14173f/.test(bandVar({ color: '#c0c0c0' })) && /--pk-bandtext:#ffffff/.test(bandVar({ color: '#111111' })))
ok('seule la bande change : le reste du paquet garde les couleurs de la collection', /--pk-a:#[0-9a-f]{3,6}/i.test(bandVar({ color: '#7c3aed' })) && /--pk-crimp:/.test(bandVar({ color: '#7c3aed' })) && !/--pk-a:#7c3aed/.test(bandVar({ color: '#7c3aed' })))
ok('sans couleur, ou couleur invalide (ancien serveur) : la bande garde la couleur de la collection, sans plantage', ['', null, undefined, 'rouge', '#fff', '#12345', '#gggggg', 'red', 123, '#7c3aed '].every((c) => !/--pk-band:#7c3aed|--pk-band:rouge|--pk-band:red|--pk-band:#fff;/.test(bandVar({ color: c })) && /--pk-band:color-mix/.test(bandVar({ color: c }))))
ok('bandColors : couleur valide (majuscules ou minuscules) -> variables ; sinon rien', bandColors('#7C3AED')['--pk-band'] === '#7C3AED' && bandColors('#7c3aed')['--pk-bandtext'] === '#ffffff' && bandColors('#fff') === null && bandColors(null) === null && bandColors(undefined) === null && bandColors('#12345g') === null)
ok('le booster Gold garde sa palette dorée (la couleur du booster ne s\'applique pas)', !/style=/.test((pack({ category: cat, golden: true, color: '#7c3aed' }).match(/class="pack-wrap[^"]*"[^>]*>/) || [''])[0]))
ok('sans collection (aperçu), la couleur du booster s\'applique quand même à la bande', /--pk-band:#7c3aed/.test((pack({ color: '#7c3aed' }).match(/style="([^"]*)"/) || [])[1] ?? '') )
console.log(bad ? `\n${bad} ÉCHEC(S)` : '\nCarte et booster : tous les contrôles sont passés.')
process.exit(bad ? 1 : 0)
