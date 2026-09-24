# pass-emploi-dashboard

Tableau de bord des notifications Pass Emploi. Il remplace les canaux Mattermost
`monitoring production` / `jobs production` : les applications qui postaient sur un
webhook Mattermost postent désormais ici, et les messages (markdown, tableaux,
attachments) sont affichés par **catégorie** et par **environnement**.

- 4 catégories, une par onglet : **Jobs**, **Elastic**, **Scalingo**, **CVE**
- 2 environnements par catégorie, **Prod** par défaut et un switch vers **Staging**
- 8 webhooks entrants au total, compatibles avec le format des webhooks entrants Mattermost / Slack
- mise à jour en temps réel (Server-Sent Events), historique paginé, purge automatique

Une seule application Node sert le back (webhooks + API) et le front. Une seule base
PostgreSQL (SQLite en local si aucune base n'est configurée).

## Démarrage rapide

```bash
yarn install
cp .env.template .env      # optionnel, tout a une valeur par défaut en local
yarn dev                   # http://localhost:3100, SQLite dans ./data
yarn test
```

En local, sans variable d'environnement, les webhooks sont `POST /hooks/<catégorie>-<env>`,
par exemple :

```bash
curl -X POST http://localhost:3100/hooks/jobs-prod \
  -H 'Content-Type: application/json' \
  -d '{"username":"CEJ Lama","text":"### Résultat du job _TEST_\n| Statut | :white_check_mark: |\n|:--|:--|\n| succes | true |"}'
```

## Webhooks entrants

| Catégorie  | Émetteurs attendus                                        | Prod                          | Staging                          |
|------------|-----------------------------------------------------------|-------------------------------|----------------------------------|
| `jobs`     | pass-emploi-api (`MATTERMOST_JOBS_WEBHOOK_URL`)           | `/hooks/$HOOK_TOKEN_JOBS_PROD`     | `/hooks/$HOOK_TOKEN_JOBS_STAGING`     |
| `elastic`  | Alertes Kibana / Elastic (connecteur Slack ou Webhook)    | `/hooks/$HOOK_TOKEN_ELASTIC_PROD`  | `/hooks/$HOOK_TOKEN_ELASTIC_STAGING`  |
| `scalingo` | Notifieurs Scalingo (type Slack)                          | `/hooks/$HOOK_TOKEN_SCALINGO_PROD` | `/hooks/$HOOK_TOKEN_SCALINGO_STAGING` |
| `cve`      | Workflow GitHub `security-alerts.yml` (`MATTERMOST_WEBHOOK_URL`) | `/hooks/$HOOK_TOKEN_CVE_PROD` | `/hooks/$HOOK_TOKEN_CVE_STAGING` |

Le front affiche l'URL complète du webhook de l'onglet courant (bouton **Webhook**),
avec un exemple `curl`.

### Format accepté

`POST` avec un corps JSON (`Content-Type: application/json`, ou absent), ou un formulaire
`application/x-www-form-urlencoded` avec un champ `payload` contenant le JSON, comme
Mattermost et Slack. Champs interprétés :

```json
{
  "username": "CEJ Lama",
  "icon_url": "https://…/avatar.png",
  "icon_emoji": ":robot:",
  "text": "Markdown (GFM : titres, tableaux, code, liens, emojis :shortcode:)",
  "attachments": [
    {
      "color": "#FF0000",
      "pretext": "…", "author_name": "…", "author_link": "…", "author_icon": "…",
      "title": "…", "title_link": "…",
      "text": "Markdown",
      "fields": [{ "title": "…", "value": "Markdown", "short": true }],
      "image_url": "…", "thumb_url": "…", "footer": "…"
    }
  ]
}
```

Tout autre JSON est accepté (réponse `200 ok`). S'il vient d'une source connue, il est mis en
forme à l'affichage ; sinon il est affiché brut. Le payload complet est toujours conservé et
consultable (« Payload brut »). Taille max : 1 Mo.

### Sources reconnues sans format Mattermost

- **Évènements Scalingo** (notifieur de type *webhook*, qui poste l'objet event de l'API Scalingo) :
  déploiements (statut, auteur, ref, durée, lien vers le déploiement), crashs (logs), redémarrages,
  scaling (avant → après), alertes de métriques, addons, variables, domaines, notifieurs,
  collaborateurs… Titre lié au dashboard Scalingo (`SCALINGO_REGION`), couleur selon la gravité,
  auteur en pied. Les types inconnus sont affichés génériquement (type humanisé + champs).

La mise en forme se fait à la lecture, depuis le payload brut : les évènements déjà reçus en
profitent aussi.

Le HTML produit est assaini côté serveur (`sanitize-html`), les liens s'ouvrent dans un
nouvel onglet, les URLs non `http(s)` sont ignorées.

## Configuration (variables d'environnement)

| Variable                        | Défaut          | Rôle |
|---------------------------------|-----------------|------|
| `PORT`                          | `3100`          | Port HTTP |
| `PUBLIC_URL`                    | déduit de la requête | URL publique, pour afficher les URLs de webhook |
| `DATABASE_URL`                  | –               | PostgreSQL. Fourni par l'addon Scalingo (`SCALINGO_POSTGRESQL_URL` est aussi lu). Sans valeur : SQLite |
| `DATABASE_SSL`                  | auto            | `false` pour désactiver TLS. Par défaut TLS activé sauf `localhost` / `sslmode=disable` (certificat auto-signé Scalingo accepté) |
| `DATA_DIR`                      | `./data`        | Dossier du fichier SQLite |
| `RETENTION_DAYS`                | `30`            | Purge des notifications plus anciennes (au démarrage puis toutes les heures) |
| `SCALINGO_REGION`               | `osc-secnum-fr1` | Région des apps Scalingo, pour les liens vers le dashboard dans les évènements Scalingo |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | –       | Basic Auth du front et de l'API. **Obligatoire en production.** Les webhooks n'y sont pas soumis |
| `HOOK_TOKEN_<CATÉGORIE>_<ENV>`  | `<catégorie>-<env>` | Secret de chaque webhook (`HOOK_TOKEN_JOBS_PROD`, `HOOK_TOKEN_CVE_STAGING`, …). **À définir en production**, la valeur par défaut est devinable |

Au démarrage, l'application avertit si l'authentification est absente ou si des
tokens par défaut sont utilisés.

## Déploiement sur Scalingo

L'application est prévue pour tourner sur Scalingo avec l'addon PostgreSQL, en une
seule app (`Procfile` : `web: yarn start`, build par `yarn build` via le buildpack Node).

`scalingo.json` déclare l'addon et génère automatiquement `DASHBOARD_PASSWORD` et les
8 `HOOK_TOKEN_*` au premier déploiement (`generator: secret`). Sinon, à la main :

```bash
scalingo -a pass-emploi-dashboard addons-add postgresql postgresql-starter-512
scalingo -a pass-emploi-dashboard env-set \
  DASHBOARD_USER=pass-emploi \
  DASHBOARD_PASSWORD="$(openssl rand -hex 24)" \
  HOOK_TOKEN_JOBS_PROD="$(openssl rand -hex 24)" \
  HOOK_TOKEN_JOBS_STAGING="$(openssl rand -hex 24)" \
  HOOK_TOKEN_ELASTIC_PROD="$(openssl rand -hex 24)" \
  HOOK_TOKEN_ELASTIC_STAGING="$(openssl rand -hex 24)" \
  HOOK_TOKEN_SCALINGO_PROD="$(openssl rand -hex 24)" \
  HOOK_TOKEN_SCALINGO_STAGING="$(openssl rand -hex 24)" \
  HOOK_TOKEN_CVE_PROD="$(openssl rand -hex 24)" \
  HOOK_TOKEN_CVE_STAGING="$(openssl rand -hex 24)"
```

Le schéma de la base est créé automatiquement au démarrage (`CREATE TABLE IF NOT EXISTS`).

### Brancher les émetteurs

Remplacer l'ancienne URL Mattermost par l'URL du webhook correspondant, visible dans le
front (bouton **Webhook**) :

- **pass-emploi-api** : variable `MATTERMOST_JOBS_WEBHOOK_URL` (prod et staging) → webhook `jobs`.
  Aucun changement de code : le payload `{ username, text }` est déjà compatible.
- **Scalingo** : notifieurs des apps → webhook `scalingo` (prod / staging). Type *webhook*
  (évènements bruts, mis en forme par le tableau de bord) ou type *Slack* (format Mattermost).
- **Elastic / Kibana** : connecteur *Slack* (ou *Webhook* avec un corps `{"text": "…"}`) → webhook `elastic`.
- **GitHub CVE** : secret `MATTERMOST_WEBHOOK_URL` du workflow `security-alerts.yml` → webhook `cve` (prod).

## API

| Route | Description |
|-------|-------------|
| `POST /hooks/:token` | Webhook entrant (sans Basic Auth). Réponse `ok` |
| `GET /health` | Sonde de vie |
| `GET /api/config` | Catégories, environnements, URLs de webhook |
| `GET /api/messages?category=&env=&limit=&before=` | Messages du plus récent au plus ancien, HTML rendu, `hasMore` pour paginer |
| `GET /api/counts` | Totaux et volume des dernières 24 h par catégorie / environnement |
| `GET /api/events` | Flux SSE, évènement `notification` à chaque message reçu |

## Structure

```
src/
  server.ts      démarrage, purge périodique, arrêt propre
  app.ts         routes Express (webhooks, API, front statique)
  config.ts      catégories, environnements, variables d'environnement
  webhook.ts     interprétation des payloads Mattermost / Slack
  render.ts      markdown → HTML assaini (marked + node-emoji + sanitize-html)
  formatters/    mise en forme des payloads de sources connues (évènements Scalingo)
  events.ts      diffusion temps réel (SSE)
  auth.ts        Basic Auth
  store/         PostgreSQL (prod) et SQLite (local / tests)
public/          front (HTML / CSS / JS sans framework)
test/            tests (node:test)
```
