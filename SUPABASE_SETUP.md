# Activer la memoire horaire BTC1H

Cette configuration rend la collecte independante du navigateur. Une fois activee, Supabase cree l'estimation fixe, cloture l'observation et conserve chaque heure meme lorsque BTC1H est ferme.

## 1. Creer le projet

1. Creer un projet sur `https://supabase.com`.
2. Ouvrir `SQL Editor` dans le tableau de bord.
3. Copier puis executer le contenu de `supabase/migrations/202607130001_hourly_study.sql`.

La table `hourly_observations` devient lisible depuis l'application, mais seul le collecteur possede les droits d'ecriture.

## 2. Deployer le collecteur

Installer le CLI Supabase, se connecter, puis depuis le dossier BTC1H :

```powershell
supabase login
supabase link --project-ref VOTRE_REFERENCE_PROJET
supabase secrets set COLLECTOR_SECRET=UNE_LONGUE_VALEUR_ALEATOIRE
supabase functions deploy collect-hour
```

Ne jamais placer `SUPABASE_SERVICE_ROLE_KEY` dans `config.js`. Supabase la fournit automatiquement a la fonction distante.

## 3. Planifier une collecte chaque minute

Dans `SQL Editor`, activer les extensions `pg_cron`, `pg_net` et `vault`, puis adapter et executer :

```sql
select vault.create_secret(
  'https://VOTRE_REFERENCE_PROJET.supabase.co',
  'project_url'
);

select vault.create_secret(
  'LA_MEME_LONGUE_VALEUR_ALEATOIRE',
  'collector_secret'
);

select cron.schedule(
  'btc1h-collect-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/collect-hour',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-collector-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'collector_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Le collecteur est idempotent : plusieurs passages pendant la meme heure ne creent pas de doublon.

## 4. Relier l'interface

Dans `Project Settings > API Keys`, copier l'URL du projet et la cle publique `Publishable` (`sb_publishable_...`) ou l'ancienne cle `anon`, puis renseigner `config.js` :

```js
window.BTC1H_CONFIG = {
  supabaseUrl: "https://VOTRE_REFERENCE_PROJET.supabase.co",
  supabaseAnonKey: "VOTRE_CLE_PUBLIQUE"
};
```

Ces deux valeurs sont destinees aux applications publiques. Les regles RLS empechent l'interface d'ecrire dans la base.

## 5. Verifier

1. Appeler une premiere fois la fonction ou attendre la prochaine minute.
2. Verifier `collector_runs` : le dernier statut doit etre `success`.
3. Verifier `hourly_observations` : l'heure courante doit etre `live` et `pending`.
4. Apres l'heure pleine, son verdict doit devenir `correct`, `wrong` ou `neutral`.
5. Ouvrir BTC1H : le badge de la base doit afficher `Connectee`.

Au premier lancement, les heures terminees encore disponibles dans la fenetre Binance sont ajoutees comme `replay`. Elles restent toujours separees des predictions `live`.
