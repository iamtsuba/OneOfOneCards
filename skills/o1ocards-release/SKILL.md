---
name: o1ocards-release
description: Livre en production les développements validés en préproduction de l'application 1/1 Cards (domaine 1o1cards.cc, dépôt GitHub OneOfOneCards, base Supabase partagée, tables o1ocards_ et pp_o1ocards_). Prépare le plan de livraison, le SQL de production et les fonctions Edge à déployer, fusionne la branche preprod dans main, crée l'étiquette de version, déploie le site sur GitHub Pages et sait revenir en arrière. À utiliser dès que l'utilisateur demande de livrer, mettre en prod, passer en production, pousser ou promouvoir la préprod, faire une release, une mise en production ou un déploiement de 1/1 Cards, ou demande ce qui reste à livrer de la préprod vers la prod, même s'il ne cite pas le mot « skill ».
---

# Livrer la préproduction en production : 1/1 Cards

## Le modèle en bref

- Deux environnements dans **la même base Supabase** : production (tables et fonctions `o1ocards_*`, site `https://1o1cards.cc/`)
  et préproduction (`pp_o1ocards_*`, site `https://1o1cards.cc/preprod/`). Mêmes comptes joueurs, progression séparée.
- Dépôt `iamtsuba/OneOfOneCards` : branche `main` = production, branche `preprod` = développement et préproduction,
  branche `gh-pages` = sites publiés (jamais modifiée à la main).
- Livrer = (1) exécuter en production le SQL qui a été éprouvé en préproduction, (2) redéployer les fonctions Edge modifiées,
  (3) fusionner `preprod` dans `main`, (4) déployer le site de production. Les données de production ne sont jamais copiées
  depuis la préproduction.
- Détails (domaine, secrets, Stripe, webhooks) : `references/environments.md`. Lis-le si l'utilisateur pose une question de
  configuration ou si la livraison touche aux fonctions de paiement.

## Règles de sécurité

Une livraison modifie ce que voient de vrais joueurs et peut toucher leur argent. Ces règles existent pour cette raison :

1. **Rien en production sans accord explicite.** Présente le plan, attends un « oui » clair, puis seulement lance `apply --yes`.
   Un « ok pour la suite » donné avant d'avoir vu le plan ne compte pas.
2. **La base de données d'abord, le site ensuite.** Le nouveau site appelle les nouvelles fonctions SQL ; si elles n'existent pas encore,
   le jeu est cassé pour tout le monde. Tu n'as pas accès à Supabase depuis ton environnement : c'est l'utilisateur qui exécute
   le SQL et déploie les fonctions, toi tu les lui prépares et tu attends sa confirmation.
3. **Jamais de SQL de préproduction en production, ni l'inverse.** Les fichiers diffèrent par leur préfixe ; vérifie le nom du fichier
   (`schema.prod.sql`, pas `schema.preprod.sql`) quand tu le présentes.
4. **Le jeton GitHub** (droit « Contents : read and write » sur le dépôt) est demandé à l'utilisateur à chaque livraison, passé
   uniquement en variable d'environnement (`GITHUB_TOKEN=... node ...`), jamais écrit dans un fichier, jamais affiché, et tu
   lui rappelles de le révoquer ensuite. Ne force jamais un `push` (`--force`) sur `main` ni sur `gh-pages`.
5. **Un test en échec bloque la livraison.** Ne contourne pas un échec : explique-le et propose la correction sur `preprod`.

## Procédure

Les commandes se lancent depuis le dossier de ce skill : `node scripts/promote.mjs <commande>` (Node 20 ou plus, git).
Ajoute `--reuse-modules <dossier>` si le dépôt est déjà cloné avec ses dépendances, pour éviter un `npm ci`.

### 1. Faire le point

```bash
GITHUB_TOKEN=... node scripts/promote.mjs status
```
Affiche les têtes de `main` et `preprod`, l'avance de `preprod`, la version en ligne de chaque site et les dernières étiquettes
`release-*`. Si `preprod` n'a aucun commit d'avance : il n'y a rien à livrer, dis-le et arrête-toi.

### 2. Établir le plan

```bash
GITHUB_TOKEN=... node scripts/promote.mjs plan --out release-out
```
Le plan clone le dépôt, vérifie que le SQL et les fonctions générés sont à jour, compile la production, lance les tests du front,
des fonctions Edge (Deno requis : `npm i --no-save deno`) et du SQL (PostgreSQL requis : `apt-get install -y postgresql`), et
écrit dans `release-out/` : `plan.md`, `plan.json`, `schema.prod.sql`, les migrations à exécuter et le code des fonctions de
production à déployer. Les tests ignorés faute d'outil sont signalés : installe l'outil plutôt que de livrer sans test quand c'est
possible (`--skip-tests` seulement si l'utilisateur le demande).

### 3. Lire le plan avec l'utilisateur

Résume en français simple, sans jargon, dans cet ordre :
1. **Ce qui change pour les joueurs** (déduit des commits ; reformule-les, ne recopie pas les messages techniques) ;
2. **Base de données** : migrations à exécuter une seule fois (dans l'ordre), puis le schéma de production (relançable sans risque) ;
   reprends les « instructions à relire » (suppressions, renommages) en expliquant lesquelles sont attendues ;
3. **Fonctions Edge** à déployer (Verify JWT désactivé) et secrets éventuellement nouveaux ;
4. **Avertissements** : préproduction en ligne différente de la branche (redéployer et retester avant), `main` en avance sur `preprod`
   (nécessite `--merge`), test en échec ;
5. **Le verdict** (prêt, avec réserves, à ne pas livrer) et la décision demandée.

Si une migration supprime ou renomme des données, demande à l'utilisateur de confirmer qu'une sauvegarde existe
(Supabase > Database > Backups) avant de continuer.

### 4. L'utilisateur exécute la base et les fonctions

Présente les fichiers de `release-out/` (copie-les dans `/mnt/user-data/outputs/` et utilise `present_files`), avec l'ordre exact :
migrations, puis `schema.prod.sql`, puis déploiement des fonctions. Demande-lui de confirmer **quand c'est fait et sans erreur**.
Si le SQL renvoie une erreur, arrête-toi : ne livre pas le site, diagnostique avec lui (reproduis sur une base de test avec
`tests/run-sql.sh` si besoin).

### 5. Livrer

Après confirmation de l'étape 4 **et** accord explicite de l'utilisateur :
```bash
GITHUB_TOKEN=... node scripts/promote.mjs apply --yes
```
Le script fusionne `preprod` dans `main` (avance rapide ; `--merge` si `main` a divergé et que l'utilisateur est d'accord après avoir vu ce
que `main` contient en plus), pousse `main`, crée et pousse l'étiquette `release-AAAAMMJJ-HHMM`, déploie le site de production
(en conservant le fichier `CNAME` du domaine et le dossier `preprod/`) et contrôle que la version en ligne correspond au commit livré.

### 6. Vérifier et conclure

Le site met une à deux minutes à se mettre à jour. Contrôle `https://1o1cards.cc/version.json` (le commit doit être celui de la livraison)
et fais parcourir à l'utilisateur la liste : connexion, ouverture d'un booster, collection, marché, boutique (bouton d'achat visible
seulement si `shop_enabled = 1`), console admin. Termine par : ce qui a été livré, l'étiquette créée, les actions restantes
(supprimer les anciennes fonctions Edge, révoquer le jeton) et la commande de retour arrière.

### Retour arrière

```bash
GITHUB_TOKEN=... node scripts/promote.mjs rollback release-AAAAMMJJ-HHMM --yes
```
Redéploie le site de production tel qu'il était à cette étiquette (pour toute étiquette `release-*`). Précise toujours à l'utilisateur
que **la base de données n'est pas annulée** : une migration exécutée se corrige en avant (nouvelle migration), pas en arrière.
Si le problème vient d'un changement de structure, prépare la correction sur `preprod`, éprouve-la, puis livre-la normalement.

## Cas particuliers

- **Première livraison avec cette structure** (la production utilise encore les tables `opennumber_*`) : le plan liste la migration
  `001_rename_opennumber_to_o1ocards.sql`. Elle renomme les tables en conservant les données, supprime les anciennes fonctions,
  et l'ancienne version du site cesse de fonctionner dès son exécution : enchaîne vite l'étape 5. Les joueurs devront se
  reconnecter une fois (la clé de session change) et réaccepter les conditions de vente (version 3).
- **La préproduction en ligne n'est pas la tête de `preprod`** : demande de redéployer (`GITHUB_TOKEN=... npm run deploy:preprod` dans le dépôt)
  et de retester avant de livrer ; ce qui n'a pas été vu en préproduction ne doit pas arriver en production.
- **Correctif urgent directement sur `main`** : après la correction, reporte-la sur `preprod` (`git merge main`) pour que la prochaine
  livraison ne la perde pas.
- **Nouvelles fonctions Edge** : elles demandent des secrets (`STRIPE_SECRET_KEY`, `SITE_URL`, `STRIPE_WEBHOOK_SECRET` en production) et un
  webhook Stripe par environnement ; vérifie avec `references/environments.md` qu'ils existent avant de livrer le paiement.
- **Domaine pas encore configuré** : le site reste accessible sur `https://iamtsuba.github.io/OneOfOneCards/` (production) et
  `.../preprod/` (préproduction) ; les adresses `1o1cards.cc` n'apparaissent qu'après la configuration DNS et GitHub Pages.

## Commandes de référence

| Commande | Effet |
|---|---|
| `promote.mjs status` | versions en ligne, avance de `preprod`, dernières étiquettes |
| `promote.mjs plan [--out DIR] [--skip-tests]` | plan, vérifications, fichiers à présenter ; code de sortie 1 si une vérification échoue |
| `promote.mjs apply --yes [--merge]` | fusionne, étiquette, déploie la production |
| `promote.mjs rollback <étiquette> --yes` | redéploie le site d'une livraison précédente |
| options communes | `--repo owner/nom`, `--remote URL`, `--dir DOSSIER`, `--reuse-modules DOSSIER`, `--skip-install` |
