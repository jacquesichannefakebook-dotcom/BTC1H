# BTC1H

Application locale de lecture directionnelle Bitcoin sur horizon court, avec un focus clair sur les creneaux 1h.

Elle affiche un signal simple :

- `+` : valeur BTC anticipee au-dessus du prix actuel.
- `-` : valeur BTC anticipee sous le prix actuel.
- `~` : zone neutre, signal insuffisant face au bruit.

L'interface met d'abord en avant une lecture simple : scenario principal, cap live, repere d'ouverture, resume "A retenir", puis les details techniques dans des sections repliables.

## Utilisation

Double-clique sur `start.bat`, puis laisse la fenetre ouverte pendant que tu utilises l'application.

Si le lanceur ne marche pas, ouvre `index.html` directement dans un navigateur moderne.

1. Choisis l'horizon : 15, 30, 45, 60, 90, 120 ou 180 minutes.
2. Choisis la sensibilite : rapide, equilibree ou prudente.
3. Laisse le mode Live actif pour actualiser automatiquement.
4. Active "Graphiques indicateurs" si tu veux voir les mini-graphiques des facteurs du modele.
5. Lis le signal principal `+`, `-` ou `~`.

Tu peux coller une URL Polymarket uniquement pour lire le creneau et ajuster l'horizon. L'application ne lit pas le carnet d'ordres et ne place aucun ordre.

Le graphique affiche les ticks de 15 minutes, les heures pleines, la prochaine heure et le temps restant avant cette prochaine heure.

La section "Creneaux horaires" compare le moment present, la fin de l'heure courante, l'heure suivante et l'horizon choisi.

Les cartes principales separent maintenant :

- `Cap live` : objectif variable, recalcule en continu, avec confiance variable.
- `Repere d'ouverture` : objectif fixe, calcule au debut de l'heure, avec confiance fixe.

La section "A etudier" resume les zones de range, l'invalidation, l'amplitude normale et les points qui meritent attention avant d'interpreter le signal.

La section "Historique horaire" affiche les dernieres heures terminees : sens final, variation, ouverture, cloture et amplitude.

La section "Hypotheses de confiance" separe le signal live, recalcule en continu, et le repere d'ouverture fixe, recalcule a chaque debut d'heure. L'hypothese live affiche aussi une cote indicative interne basee sur la confiance du modele. Quand l'heure se termine, l'historique indique si cette hypothese fixe etait juste, fausse ou neutre.

La section "Modele cloture horaire" est specialisee pour les creneaux 1h : elle compare la cloture estimee de l'heure avec le prix d'ouverture de cette meme heure.

La section "Supervision du moteur" rejoue les dernieres heures disponibles, mesure les signaux justes/faux/neutres et ajuste la confiance affichee selon la fiabilite recente.

La section "Base d'etude horaire" peut se connecter a Supabase. Un collecteur planifie y capture l'estimation fixe, clot chaque observation et conserve toutes les heures meme lorsque l'application est fermee. Les predictions reelles `live` restent separees des reconstitutions `replay`.

Voir `SUPABASE_SETUP.md` pour activer cette memoire persistante.

## Partage et publicite

L'application inclut les metadonnees de partage, un bouton "Partager", un manifest mobile installable et des emplacements publicitaires neutres. Les encarts sont des placeholders : pour afficher de vraies publicites, il faut ajouter le script d'une regie comme Google AdSense apres validation du site, ou remplacer ces zones par des sponsors directs.

Voir `PUBLISH.md` pour les fichiers a publier et les etapes de monetisation.

Voir `ALGO_SUPERVISION.md` pour la feuille de route algorithmique.

## Quota gratuit

La version statique inclut un quota local : 2h gratuites par jour dans le navigateur, avec un bouton "Voir une pub +2h" qui ajoute 2h supplementaires. Cette limite est stockee dans le navigateur et sert de prototype. Pour un vrai produit payant, la limite devra etre verifiee cote serveur avec comptes utilisateurs.

## Calcul

Le signal combine momentum 15/60/240 minutes, EMA 12/26/50/200, MACD, RSI, bandes de Bollinger, volume relatif, volatilite courte/longue, regime de marche, bruit attendu, modele special cloture horaire et calibration par backtest horaire local. Il compare ensuite le prix BTC anticipe au prix actuel ou, pour le modele horaire, la cloture estimee avec l'ouverture de l'heure.

## Important

Ce n'est pas un conseil financier et l'outil ne garantit aucun gain. Il sert a rendre la lecture directionnelle plus rapide et plus disciplinee.
