import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'

const euro = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)

// Valeur manquante : mise en évidence pour que le vendeur pense à la renseigner
const V = ({ value, children }) => (value ? (children ?? value) : <span className="todo">[à compléter]</span>)

// Texte des conditions générales de vente et mentions légales.
// Modèle à faire relire : les informations du vendeur viennent de la table legal (préfixée par l’environnement).
export function LegalDocument({ legal = {}, config = {} }) {
  const price = config.stripe_pack_price_cents ? euro(config.stripe_pack_price_cents) : '[prix]'
  const boosters = config.stripe_pack_boosters ?? '[nombre]'
  const mail = legal.seller_email
  return (
    <article className="legal-text">
      <h2>Conditions générales de vente</h2>
      <p className="muted">Version {config.cgv_version ?? 1}. La version applicable est celle en vigueur au moment de la commande.</p>

      <h3>1. Éditeur et vendeur</h3>
      <p>
        1/1 Cards (« l’Application ») est éditée par <V value={legal.seller_name} />
        {legal.seller_status ? `, ${legal.seller_status}` : ''}, <V value={legal.seller_address} />.
        Contact : <V value={mail} />{legal.seller_phone ? `, ${legal.seller_phone}` : ''}.
        {' '}SIRET : <V value={legal.seller_siret} />. TVA : <V value={legal.seller_vat} />.
      </p>

      <h3>2. Objet</h3>
      <p>
        Les présentes conditions régissent l’achat, dans l’Application, de packs de boosters : des contenus numériques
        (cartes virtuelles numérotées) utilisables uniquement dans l’Application. Elles s’appliquent à tout achat effectué
        avec le bouton « Acheter ».
      </p>

      <h3>3. Produit et prix</h3>
      <p>
        Un pack donne {boosters} boosters supplémentaires, au prix de {price}, toutes taxes comprises lorsqu’elles
        s’appliquent. Le prix applicable est celui affiché au moment de la commande. Les boosters achetés s’ajoutent au stock
        du joueur, ne comptent pas dans le plafond de la recharge gratuite et sont utilisés après le stock gratuit.
      </p>

      <h3>4. Catégories et nature aléatoire du contenu</h3>
      <p>
        Les cartes sont réparties en catégories de boosters (par exemple « Années 80 ») et en types de cartes, chaque type ayant
        sa propre numérotation. Une seule catégorie est ouvrable à la fois : la suivante s’ouvre quand toutes les cartes de la
        précédente ont été tirées. Le contenu d’un booster est tiré au hasard parmi les cartes encore disponibles de la catégorie
        en cours. Chaque carte n’existe qu’en un seul exemplaire : une carte déjà tirée par un joueur ne peut plus être tirée par
        un autre. Aucune carte, aucun type et aucune rareté n’est garanti. La rareté d’une carte (Unique, Alpha, Omega, Ultra Rare,
        Super Rare, Rare, Commune) dépend de son numéro et de la taille de sa série. Un booster peut exceptionnellement être
        « doré », avec un contenu défini à l’avance.
      </p>

      <h3>5. Commande et paiement</h3>
      <p>
        Le paiement s’effectue en ligne via Stripe, par carte bancaire ou autre moyen proposé sur la page de paiement. Stripe
        peut intervenir comme vendeur officiel pour le calcul, la collecte et le reversement des taxes ; ses conditions
        s’appliquent alors au traitement du paiement. La commande est ferme à la confirmation du paiement.
      </p>

      <h3>6. Exécution immédiate</h3>
      <p>
        Les boosters sont ajoutés au compte du joueur dès la confirmation du paiement, en général en quelques secondes. En cas
        de retard ou de problème, écrire à <V value={mail} />.
      </p>

      <h3>7. Droit de rétractation</h3>
      <p>
        Pour un achat à distance, le consommateur dispose en principe de 14 jours pour se rétracter sans motif. Toutefois,
        conformément à l’article L221-28, 13° du Code de la consommation, ce droit ne peut pas être exercé pour la fourniture
        d’un contenu numérique non fourni sur un support matériel, dont l’exécution a commencé après l’accord préalable
        exprès du consommateur et son renoncement exprès à son droit de rétractation.
      </p>
      <p>
        Avant de payer, l’acheteur doit donc cocher une case par laquelle il demande l’exécution immédiate de sa commande et
        reconnaît perdre son droit de rétractation dès que les boosters sont fournis. Cette demande est enregistrée (date,
        version des conditions, texte accepté, compte de l’acheteur).
      </p>

      <h3>8. Pièces, cartes et marché</h3>
      <p>
        Les pièces et les cartes sont des éléments virtuels du jeu. Elles n’ont aucune valeur monétaire en dehors de
        l’Application, ne sont ni remboursables ni convertibles en argent réel, et ne peuvent pas être vendues entre joueurs
        contre de l’argent réel. Seuls les packs de boosters décrits à l’article 3 sont vendus contre de l’argent réel.
      </p>

      <h3>9. Garanties légales</h3>
      <p>
        Le consommateur bénéficie des garanties légales applicables aux contenus numériques, notamment en cas de défaut de
        fourniture ou de non-conformité. Pour toute demande, écrire à <V value={mail} />.
      </p>

      <h3>10. Données personnelles</h3>
      <p>
        Les données nécessaires (adresse email, pseudo, historique des cartes et des achats, preuve d’acceptation des présentes
        conditions) sont utilisées pour fournir le jeu et gérer les achats. Les données de paiement sont traitées par Stripe :
        l’éditeur n’a pas accès au numéro de carte. Pour exercer tes droits d’accès, de rectification ou d’effacement :
        <V value={mail}> {mail}</V>.
      </p>

      <h3>11. Médiation</h3>
      <p>
        En cas de litige, le consommateur peut recourir gratuitement à un médiateur de la consommation :{' '}
        <V value={legal.mediator_name} />{legal.mediator_url ? ` (${legal.mediator_url})` : ''}.
      </p>

      <h3>12. Droit applicable</h3>
      <p>
        Les présentes conditions sont soumises au droit français, sans préjudice des dispositions protectrices du droit du pays
        de résidence du consommateur.
      </p>

      <h2>Mentions légales</h2>
      <p>
        Éditeur et directeur de la publication : <V value={legal.seller_name} />, <V value={legal.seller_address} />.
        Contact : <V value={mail} />. Hébergement : site hébergé par GitHub (GitHub Pages), données hébergées par Supabase.
      </p>
    </article>
  )
}

// Fenêtre qui charge et affiche les conditions
export default function LegalSheet({ onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getLegal().then(setData).catch((e) => setError(explain(e)))
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Conditions de vente" onClick={onClose}>
      <div className="legal-panel" onClick={(e) => e.stopPropagation()}>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!data && !error && <p className="muted">Chargement…</p>}
        {data && <LegalDocument legal={data.legal} config={data.config} />}
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}
