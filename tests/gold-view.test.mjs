// Rend l'annonce « Carte complétée » et la liste des boosters Gold sans navigateur.
//   node tests/gold-view.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-gold-'))
await build({
  stdin: { contents: "export { GoldRewardList } from './src/components/Boosters.jsx'; export { default as GoldRewardModal } from './src/components/GoldRewardModal.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { GoldRewardList, GoldRewardModal, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const noop = () => {}
const typeMap = { 1: { id: 1, name: 'Chat’aigne', image: '🦔', category_id: 1 }, 2: { id: 2, name: 'Chat va ?', image: '🐱', category_id: 1 } }
const wrap = (el, status = null) => React.createElement(GameContext.Provider, { value: { catalog: { typeMap }, status } }, el)

// ---- Liste des boosters Gold à ouvrir (page Boosters)
const list = (rewards, props = {}) => renderToStaticMarkup(React.createElement(GoldRewardList, { rewards, typeMap, disabled: false, onOpen: noop, ...props }))
const one = list([{ id: 7, type_id: 1, seen: true }])
const two = list([{ id: 7, type_id: 1, seen: true }, { id: 8, type_id: 2, seen: false }])
ok('liste : rien du tout sans booster Gold à ouvrir', list([]) === '' && list(null) === '')
ok('liste : « Un booster Gold à ouvrir » avec le nom de la carte complétée et un bouton Ouvrir', /Un booster Gold à ouvrir/.test(one) && /<span>Chat’aigne<\/span>/.test(one) && /aria-label="Ouvrir le booster Gold de Chat’aigne"/.test(one) && />Ouvrir</.test(one))
ok('liste : pluriel et un bouton par booster Gold', /2 boosters Gold à ouvrir/.test(two) && (two.match(/>Ouvrir</g) || []).length === 2 && /Chat va \?/.test(two))
ok('liste : plus de composition écrite en dur (elle se règle dans le module Boosters), seulement comment le gagner', !/3 Rares|Super Rare|carte spéciale/.test(one) && /Gagné en complétant tous les emplacements d’une carte dans l’album\./.test(one))
ok('liste : le nom du booster vient du module (renommé « Or » : « Un booster Or à ouvrir », bouton « Ouvrir le booster Or de… »)', /Un booster Or à ouvrir/.test(list([{ id: 7, type_id: 1 }], { name: 'Or' })) && /aria-label="Boosters Or à ouvrir"/.test(list([{ id: 7, type_id: 1 }], { name: 'Or' })) && /Ouvrir le booster Or de Chat’aigne/.test(list([{ id: 7, type_id: 1 }], { name: 'Or' })) && !/Gold/.test(list([{ id: 7, type_id: 1 }], { name: 'Or' })))
ok('liste : pluriel avec le nom du module (« 2 boosters Or à ouvrir »)', /2 boosters Or à ouvrir/.test(list([{ id: 7, type_id: 1 }, { id: 8, type_id: 2 }], { name: 'Or' })))
ok('liste : boutons désactivés pendant une ouverture', (list([{ id: 7, type_id: 1 }], { disabled: true }).match(/disabled=""/g) || []).length === 1)
ok('liste : carte inconnue du catalogue : libellé de repli, pas de plantage', /<span>Carte<\/span>/.test(list([{ id: 9, type_id: 99 }])) && !/undefined|NaN/.test(list([{ id: 9, type_id: 99 }])))

// ---- Annonce « Carte complétée »
const modal = (rewards, status = null) => renderToStaticMarkup(wrap(React.createElement(GoldRewardModal, { rewards, onClose: noop }), status))
const m1 = modal([{ id: 7, type_id: 1, seen: false }])
const m2 = modal([{ id: 7, type_id: 1, seen: false }, { id: 8, type_id: 2, seen: false }])
ok('annonce : « Carte complétée ! », la carte, et le booster Gold débloqué', /<h2>Carte complétée !<\/h2>/.test(m1) && /Chat’aigne/.test(m1) && /Un booster Gold est débloqué\./.test(m1) && /role="dialog"[^>]*aria-label="Carte complétée"/.test(m1))
ok('annonce : « 2 cartes complétées ! » et « 2 boosters Gold sont débloqués »', /<h2>2 cartes complétées !<\/h2>/.test(m2) && /2 boosters Gold sont débloqués\./.test(m2) && /Chat va \?/.test(m2))
ok('annonce : deux boutons « Voir mon booster Gold » et « Plus tard »', />Voir mon booster Gold</.test(m1) && />Plus tard</.test(m1))
const mOr = modal([{ id: 7, type_id: 1, seen: false }, { id: 8, type_id: 2, seen: false }], { reward_booster: { name: 'Or' } })
ok('annonce : le nom du module apparaît partout (« 2 boosters Or sont débloqués », « Voir mon booster Or »), plus de « Gold » ni de composition', /2 boosters Or sont débloqués\./.test(mOr) && />Voir mon booster Or</.test(mOr) && !/Gold|3 Rares|carte spéciale/.test(mOr) && !/3 Rares|carte spéciale/.test(m1))
ok('annonce : sans nom connu (ancien serveur), « Gold » par défaut', /Un booster Gold est débloqué\./.test(m1) && />Voir mon booster Gold</.test(m1))
ok('annonce : texte court et sans donnée parasite', m1.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length < 400 && !/undefined|NaN|null/.test(m1 + m2))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nBooster Gold (rendu) : tous les contrôles sont passés.')
