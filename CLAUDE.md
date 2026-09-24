# Pass Emploi Dashboard - Contexte Technique

> Tableau de bord des notifications Pass Emploi (remplaçant des webhooks Mattermost) :
> reçoit les webhooks Jobs / Elastic / Scalingo / CVE, en prod et staging, et les affiche.

---

@../pass-emploi-tools/docs/CONTEXTE-TRANSVERSE.md

---

## Stack

| Technologie    | Usage                                                     |
|----------------|-----------------------------------------------------------|
| Node.js 22.14  | `.nvmrc`, ESM (`"type": "module"`)                        |
| TypeScript 5   | `strict`, `module: NodeNext` (imports avec extension `.js`) |
| Express 5      | Webhooks, API JSON, SSE, front statique                   |
| PostgreSQL     | Prod (Scalingo, `DATABASE_URL`) via `pg`                  |
| SQLite         | Local / tests via `node:sqlite` (Node ≥ 22.13)            |
| marked, node-emoji, sanitize-html | Rendu markdown Mattermost-compatible côté serveur |
| Yarn 4.9.2     | Toujours utiliser `yarn`                                  |

## Commandes

```bash
yarn dev      # tsx watch, SQLite dans ./data
yarn test     # node:test (test/*.test.ts)
yarn lint     # tsc --noEmit
yarn build && yarn start
```

## Points d'attention

- Les webhooks (`POST /hooks/:token`) ne passent pas par la Basic Auth : le token est le secret.
- Tout payload est accepté et conservé brut ; seuls `text`, `username`, `icon_*` et `attachments`
  sont interprétés (format Mattermost / Slack).
- Les payloads sans `text` ni `attachments` passent par `src/formatters/` à l'affichage
  (`presentMessage`) : les évènements Scalingo bruts y sont mis en forme. Pour supporter une
  nouvelle source, ajouter un formateur et le brancher dans `formatters/index.ts`.
- Le markdown de pass-emploi-api contient des tableaux indentés : `normalizeMattermostMarkdown`
  retire l'indentation devant `|` avant le rendu GFM. Ne pas la supprimer.
- Le front est en JS vanilla (`public/`), servi tel quel, sans étape de build.
- Voir `README.md` pour les variables d'environnement et le déploiement Scalingo.
