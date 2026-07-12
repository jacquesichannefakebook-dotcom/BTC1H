# Publier BTC1H

L'application est un site statique. Elle peut etre publiee sur Netlify, Vercel, Cloudflare Pages, GitHub Pages ou tout hebergeur capable de servir des fichiers HTML/CSS/JS.

## Fichiers a publier

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `icon.svg`
- `robots.txt`

## Mobile partageable

Etape conseillee : publier d'abord l'application comme PWA.

1. Mettre les fichiers en ligne sur un domaine HTTPS.
2. Verifier que `manifest.webmanifest` et `icon.svg` sont bien accessibles.
3. Ouvrir l'URL sur telephone.
4. Sur Android : menu du navigateur, puis "Installer l'application" ou "Ajouter a l'ecran d'accueil".
5. Sur iPhone : bouton de partage Safari, puis "Sur l'ecran d'accueil".

Avantage : l'app devient partageable par lien, installable sur telephone, et ne demande pas encore de validation App Store.

Pour une vraie application App Store / Google Play, il faudra ensuite emballer cette PWA avec Capacitor ou un framework mobile, ajouter un compte developpeur Apple/Google, puis soumettre l'app aux stores.

## Methode gratuite pour telephone

Sans depenser d'argent, le plus simple est :

1. Creer un compte gratuit sur GitHub.
2. Creer un depot public nomme `btc1h`.
3. Envoyer les fichiers de l'application dans ce depot.
4. Activer GitHub Pages dans les parametres du depot.
5. Ouvrir l'adresse GitHub Pages sur le telephone.
6. Ajouter BTC1H a l'ecran d'accueil.

Cette methode donne un lien partageable gratuitement. Elle ne donne pas une presence App Store, mais l'application se comporte comme une app mobile installee.

## Publicites

Les encarts visibles dans l'application sont des placeholders. Pour les monetiser :

1. Publier l'application sur un vrai domaine.
2. Ajouter une page de politique de confidentialite si une regie publicitaire le demande.
3. Faire valider le domaine par la regie choisie.
4. Remplacer les blocs `.ad-slot` par le code fourni par la regie, ou vendre ces emplacements en sponsor direct.

Formats prevus :

- haut de page : `970 x 90`
- encart intermediaire : `300 x 250`
- encart natif : format sponsor integre

## Important

Eviter les publicites qui promettent des gains, des signaux garantis ou des rendements. Le site doit rester presente comme un outil d'analyse, pas comme une promesse de profit.
