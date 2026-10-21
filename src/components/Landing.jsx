// Présentation du jeu, sous le formulaire de connexion. Elle est AUSSI pré-rendue dans le HTML de la page d'accueil au moment de la
// compilation (scripts/prerender.mjs) : les moteurs de recherche et les aperçus de partage lisent donc ce texte sans exécuter de
// JavaScript. Garder un contenu exact et sans chiffre susceptible de changer (nombre de boosters, prix…).
export default function Landing() {
  return (
    <section className="landing" aria-labelledby="landing-title">
      <div className="landing-inner">
        <h1 id="landing-title">1/1 Cards : ouvre des boosters de cartes numérotées et complète ta collection</h1>
        <p className="landing-lead">
          1/1 Cards est un jeu de collection en ligne, jouable directement dans ton navigateur, sur mobile comme sur ordinateur. Chaque carte est
          numérotée et n’existe qu’en un seul exemplaire : quand tu la tires, elle est à toi, et à personne d’autre.
        </p>

        <h2>Comment ça marche</h2>
        <ol className="landing-steps">
          <li><strong>Crée ton compte</strong> et reçois tes premiers boosters, qui se rechargent régulièrement.</li>
          <li><strong>Ouvre tes boosters</strong> : chaque carte est tirée au hasard parmi celles qui n’ont pas encore été tirées.</li>
          <li><strong>Complète ton album</strong>, échange avec les autres joueurs et vends tes cartes.</li>
        </ol>

        <h2>Des cartes numérotées, de la plus commune à l’unique</h2>
        <p>
          Chaque carte appartient à une rareté, de Commune jusqu’aux plus rares, et porte un numéro de série, par exemple 7/50. Plus une série est
          petite, moins elle contient de cartes. Les cartes Unique (1/1), Alpha (la première d’une série) et Omega (la dernière) sont les plus
          convoitées, et des cartes secrètes se cachent hors de la checklist.
        </p>

        <h2>Un album par rareté</h2>
        <p>
          Pour chaque carte et chaque rareté, ton album a un emplacement que tu remplis avec l’exemplaire de ton choix. Une carte placée dans
          l’album est protégée : elle ne peut plus être vendue tant qu’elle y figure. Complète le full set de ta collection !
        </p>

        <h2>Un marché entre joueurs</h2>
        <p>
          Mets tes cartes en vente à prix fixe ou aux enchères, fais des offres directes aux autres joueurs, suis tes cartes favorites et reçois une
          alerte dès qu’elles sont en vente. Tu peux aussi revendre rapidement une carte au jeu.
        </p>

        <h2>Questions fréquentes</h2>
        <h3>Comment obtenir des cartes ?</h3>
        <p>En ouvrant des boosters, offerts à l’inscription puis rechargés au fil du temps, ou en les achetant à d’autres joueurs sur le marché.</p>
        <h3>Deux joueurs peuvent-ils avoir la même carte ?</h3>
        <p>
          Non. Chaque carte n’existe qu’en un seul exemplaire et n’a donc qu’un seul propriétaire. Un même visuel peut exister sous d’autres numéros ou
          dans d’autres raretés : ce sont alors des cartes différentes.
        </p>
        <h3>Que devient une carte revendue au jeu ?</h3>
        <p>Elle est retirée du jeu pour de bon : elle ne reviendra plus dans les boosters.</p>
        <h3>Faut-il installer quelque chose ?</h3>
        <p>Non, 1/1 Cards fonctionne dans le navigateur de ton téléphone ou de ton ordinateur.</p>
      </div>
    </section>
  )
}
