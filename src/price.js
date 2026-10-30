// Prix en euros avec TVA. Les prix saisis dans les réglages sont HORS TVA (ex. 499 = 4,99 € HT) ; la TVA (réglage vat_percent, 20 % au départ) s'y ajoute : c'est ce que Stripe ajoute au paiement.
// Le jeu affiche donc le prix à payer TTC et le détail « HT + TVA », pour que le joueur ne découvre pas la TVA sur la page de paiement.
const fmtEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const euro = (cents) => fmtEuro.format((Number(cents) || 0) / 100)
const clampRate = (v) => Math.max(0, Math.min(100, Number(v) || 0))
const fmtRate = (pct) => String(pct).replace('.', ',')

// ht, taux, montant de la TVA (arrondi au centime, comme Stripe), ttc ; hasVat = faux sans taux ou sans prix
export function priceParts(cents, vat) {
  const ht = Math.max(0, Math.round(Number(cents) || 0))
  const pct = clampRate(vat)
  const tax = Math.round((ht * pct) / 100)
  return { ht, pct, tax, ttc: ht + tax, hasVat: pct > 0 && ht > 0 }
}
// Prix à payer : « 5,99 € TTC » (avec TVA) ou « 4,99 € » (sans TVA, ou serveur qui ne l'annonce pas encore)
export function payable(cents, vat) {
  const p = priceParts(cents, vat)
  return p.hasVat ? `${euro(p.ttc)} TTC` : euro(p.ht)
}
// Montant exact du bouton « Payer … » : le TTC
export const payAmount = (cents, vat) => euro(priceParts(cents, vat).ttc)
// Détail : « 4,99 € HT + TVA 20 % (1,00 €) » ; vide s'il n'y a pas de TVA
export function vatDetail(cents, vat) {
  const p = priceParts(cents, vat)
  return p.hasVat ? `${euro(p.ht)} HT + TVA ${fmtRate(p.pct)} % (${euro(p.tax)})` : ''
}
