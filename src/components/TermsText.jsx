// Valeur manquante : mise en évidence pour que l'éditeur pense à la renseigner
const V = ({ value, children }) => (value ? (children ?? value) : <span className="todo">[à compléter]</span>)

// Texte des conditions générales d'utilisation (en plus des conditions générales de vente).
// Modèle à faire relire par un juriste : les informations de l'éditeur viennent de la table legal (réglages de l'admin).
export function TermsDocument({ legal = {}, version = 1 }) {
  const mail = legal.seller_email
  return (
    <article className="legal-text">
      <h2>Conditions générales d’utilisation</h2>
      <p className="muted">Version {version}. Elles s’ajoutent aux conditions générales de vente, qui régissent les achats.</p>

      <h3>1. Objet et acceptation</h3>
      <p>
        Les présentes conditions encadrent l’utilisation de 1/1 Cards (« l’Application »), un jeu de collection de cartes numérotées, chacune
        n’existant qu’en un seul exemplaire. En créant un compte puis en acceptant ces conditions, tu t’engages à les respecter. Si tu ne les
        acceptes pas, tu ne peux pas utiliser l’Application.
      </p>

      <h3>2. Éditeur</h3>
      <p>
        L’Application est éditée par <V value={legal.seller_name} />, <V value={legal.seller_address} />. Contact : <V value={mail} />.
        Les informations complètes de l’éditeur figurent dans les conditions de vente et les mentions légales.
      </p>

      <h3>3. Compte, pseudo et mot de passe</h3>
      <p>
        Le compte se crée et se connecte avec un pseudo et un mot de passe, sans adresse email. Un compte est personnel : une personne, un compte.
        Le pseudo est unique et définitif : il ne peut pas être changé, il est visible des autres joueurs et ne doit ni usurper l’identité d’autrui,
        ni être injurieux, discriminatoire ou trompeur. Tu es responsable de la confidentialité de ton mot de passe et de tout ce qui est fait
        avec ton compte. En l’absence d’adresse email, un mot de passe perdu ne peut pas être récupéré automatiquement : tu peux le changer
        depuis ton profil tant que tu es connecté. L’Application s’adresse aux personnes de 16 ans et plus ; un plus jeune joue avec l’accord
        de son représentant légal.
      </p>

      <h3>4. Règles de conduite</h3>
      <p>
        Il est interdit de tricher ou de contourner les règles du jeu : utiliser des programmes automatiques, exploiter une faille ou une erreur,
        créer plusieurs comptes pour en tirer un avantage, ou s’entendre avec d’autres joueurs pour fausser le marché (enchères, offres, ventes
        entre comptes). Tu respectes les autres joueurs : pas d’insultes, de harcèlement ni de contenu illicite. Si tu découvres une faille,
        signale-la à l’éditeur plutôt que de l’exploiter.
      </p>

      <h3>5. Cartes, pièces et boosters : des objets virtuels</h3>
      <p>
        Les cartes, les pièces et les boosters sont des éléments virtuels du jeu. Ils n’ont pas de valeur monétaire, ne constituent pas un titre
        ni un placement, et ne donnent aucun droit de propriété en dehors de l’Application. Les pièces ne peuvent pas être échangées contre de
        l’argent ; les cartes ne peuvent pas être revendues en dehors de l’Application. Le contenu d’un booster est tiré au hasard et aucune carte,
        aucune rareté n’est garantie. Chaque carte numérotée n’existe qu’en un seul exemplaire : une carte déjà tirée ne peut plus l’être par un autre joueur.
      </p>

      <h3>6. Échanges entre joueurs et revente rapide</h3>
      <p>
        Les joueurs peuvent mettre leurs cartes en vente (prix fixe ou enchères), faire des offres, y répondre (accepter, refuser ou proposer
        un autre prix, appelé contre-offre) et revendre une carte à la banque. Une vente, une enchère remportée ou une offre acceptée est définitive.
        Les pièces ne sont débitées que lorsque la transaction est conclue. La revente rapide à la banque donne le nombre de pièces affiché pour
        la rareté de la carte et retire définitivement la carte du jeu : elle ne revient plus dans les boosters. Une carte rangée dans l’album ne
        peut pas être vendue tant qu’elle y reste.
      </p>

      <h3>7. Évolution du jeu</h3>
      <p>
        L’éditeur peut faire évoluer l’Application : ouvrir ou fermer des collections, ajouter ou retirer des cartes, des raretés ou des boosters,
        changer les chances de tirage, les prix, les récompenses ou les règles pour les besoins du jeu ou pour corriger une erreur. Ces changements
        s’appliquent pour l’avenir et sont décrits dans l’Application lorsqu’ils sont importants.
      </p>

      <h3>8. Propriété intellectuelle</h3>
      <p>
        L’Application, ses cartes, images, textes, marques et logiciels appartiennent à l’éditeur ou à ses concédants et sont protégés. L’éditeur
        te concède un droit d’usage personnel, limité et non transférable de l’Application. Toute copie, extraction ou réutilisation sans
        autorisation est interdite.
      </p>

      <h3>9. Données personnelles</h3>
      <p>
        Le compte n’exige pas d’adresse email. Les données utilisées (pseudo, historique des cartes, des échanges et des achats, preuve
        d’acceptation des conditions) servent à faire fonctionner le jeu ; ton pseudo est visible des autres joueurs. Les droits d’accès, de
        rectification et d’effacement s’exercent auprès de <V value={mail} />. Voir aussi la section « Données personnelles » des conditions de vente.
      </p>

      <h3>10. Disponibilité et responsabilité</h3>
      <p>
        L’Application est fournie « en l’état » : l’éditeur s’efforce de la rendre disponible mais ne garantit pas l’absence d’interruption ou
        d’erreur. Sa responsabilité ne peut être engagée pour une perte de cartes ou de pièces virtuelles causée par une cause extérieure ou par
        un usage contraire aux présentes conditions, sauf lorsque la loi l’exige. Ces conditions ne limitent pas les droits que tu tiens du droit
        de la consommation.
      </p>

      <h3>11. Sanctions et suppression du compte</h3>
      <p>
        En cas de non-respect des présentes conditions, l’éditeur peut, selon la gravité, avertir le joueur, annuler des transactions obtenues par
        fraude, retirer les cartes ou les pièces ainsi obtenues, suspendre ou supprimer le compte. Tu peux demander la suppression de ton compte à
        tout moment en écrivant à <V value={mail} />.
      </p>

      <h3>12. Modification des conditions</h3>
      <p>
        L’éditeur peut modifier ces conditions. La nouvelle version t’est présentée à ta prochaine visite : tu dois l’accepter pour continuer à
        jouer. La date et la version acceptées sont conservées comme preuve.
      </p>

      <h3>13. Droit applicable et médiation</h3>
      <p>
        Les présentes conditions sont soumises au droit français, sans préjudice des dispositions protectrices du droit du pays de résidence du
        consommateur. Le recours à un médiateur de la consommation est décrit dans les conditions de vente.
      </p>
    </article>
  )
}
