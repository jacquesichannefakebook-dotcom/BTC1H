# Supervision algorithmique BTC1H

Objectif : rendre le moteur plus pointu sans rendre la lecture utilisateur plus confuse.

## Etat actuel

Le moteur utilise deja :

- momentum 15/60/240 minutes ;
- EMA 12/26/50/200 ;
- MACD ;
- RSI ;
- bandes de Bollinger ;
- volume relatif ;
- volatilite courte/longue ;
- ATR ;
- regime de marche ;
- range recent ;
- historique horaire local ;
- hypothese live et hypothese horaire fixe.

## Probleme principal

Le modele donne parfois un `+` ou un `-` alors que l'avantage estime est faible. Dans ce cas, le signal semble aleatoire parce que le bruit de marche est plus grand que l'ecart anticipe.

## Priorites d'amelioration

### 1. Zone neutre

Ne pas forcer `+` ou `-` quand l'ecart attendu est trop faible face au bruit.

Sorties possibles :

- `+` : biais haussier clair ;
- `-` : biais baissier clair ;
- `~` : zone neutre / signal insuffisant.

Statut : implemente.

### 2. Modele special cloture horaire

Creer un score different pour l'hypothese fixe de l'heure :

- prix d'ouverture de l'heure ;
- distance au prix d'ouverture ;
- comportement des dernieres fins d'heure ;
- direction des 3/5/10 dernieres clotures horaires ;
- volatilite moyenne des heures precedentes ;
- range deja parcouru dans l'heure ;
- temps restant.

Statut : premiere version implementee. Le modele compare maintenant la cloture estimee avec l'ouverture de l'heure courante, en tenant compte de la distance a l'ouverture, du temps restant, de la position dans le range, du biais des dernieres heures, du regime et de la fiabilite recente.

### 3. Backtest local

Comparer les anciennes predictions fixes avec les clotures reelles :

- taux de justesse 10 dernieres heures ;
- taux de justesse 24 dernieres heures ;
- taux de justesse par regime ;
- taux de justesse par niveau de confiance.

Statut : premiere version implementee sur les dernieres heures disponibles. Le moteur rejoue un signal au debut des heures passees, compare la direction avec la cloture horaire, puis affiche reussite recente, neutres et erreur moyenne.

### 4. Calibration de confiance

La confiance ne doit pas seulement mesurer la force du signal. Elle doit aussi etre ajustee par la performance recente du modele.

Exemple :

- signal fort + modele recent fiable = confiance haute ;
- signal fort + modele recent mauvais = confiance reduite ;
- signal faible = neutre.

Statut : premiere calibration implementee. La confiance live est maintenant reduite ou renforcee legerement selon le backtest horaire recent.

### 5. Donnees supplementaires futures

Pistes utiles :

- order book BTC spot/futures ;
- funding rates ;
- open interest ;
- liquidations ;
- spread spot/futures ;
- dominance BTC ;
- volatilite implicite options ;
- correlation ETH/BTC ;
- donnees Polymarket si utilisees uniquement comme contexte, pas comme ordre.

## Regle directrice

Ajouter autant de parametres que necessaire dans le moteur, mais garder l'interface lisible :

1. decision simple ;
2. resume clair ;
3. details repliables ;
4. backtest visible ;
5. aucune promesse de gain.
