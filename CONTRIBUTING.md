# Contribuer à blyss-app

## Flux de travail

1. Brancher depuis `main` : `git checkout -b <type>/<sujet>`
   (`feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`).
2. Committer avec des messages clairs (impératif, une idée par commit).
3. Ouvrir une **Pull Request** vers `main`. **Aucun push direct sur `main`** —
   la branche est protégée.
4. Attendre que **tous les checks requis** passent + **1 revue** approuvée.
5. **Squash-merge** (convention du repo). La branche est supprimée après merge.

## Protection de la branche `main`

`main` est protégée (`Settings → Branches`) :

| Règle | Valeur |
|---|---|
| Push direct | interdit (PR obligatoire) |
| Revues approuvées requises | **1** |
| Branche à jour avec `main` avant merge | oui (`strict`) |
| `enforce_admins` | **non** — un·e admin peut merger sans revue en cas d'urgence (hotfix) |
| Force-push / suppression de `main` | interdits |

### Checks requis (doivent être verts pour merger)

- `Backend Tests`
- `TypeScript (backend)`
- `E2E Playwright`
- `SAST (Semgrep)`
- `ESLint Security Rules`
- `Dependency Audit (SCA)`
- `Secret Scanning`
- `GitGuardian Security Checks`
- `CodeQL Analysis` *(workflow `.github/workflows/security-audit.yml` — cf. `SECURITY.md`)*

### Checks **non** requis (consultatifs)

- `CodeQL` (GitHub Advanced Security, sans workflow) — pas de baseline sur les
  PR, réattribue le backlog préexistant. Peut être rouge sans bloquer. Voir
  `SECURITY.md` § « Analyse statique — source de vérité » et l'issue #14.
- `Semgrep OSS` (GHAS) — la référence est `SAST (Semgrep)`.
- `Post Security Summary` — job de résumé.

## Checks « flaky »

Les tests E2E sont configurés avec `retries: 1` en CI
(`playwright.config.ts`). En cas d'échec isolé et non reproductible d'un
check :

1. Relancer le job : **Actions → le run → `Re-run failed jobs`**
   (ou `gh run rerun <run-id> --failed`).
2. Si l'échec est **reproductible**, ne pas le contourner : ouvrir une issue et
   corriger.

Un·e admin peut, en dernier recours et pour un correctif urgent, merger via
`gh pr merge <n> --admin` (`enforce_admins` est désactivé) — à documenter dans
la PR.

## Tests locaux avant PR

```bash
# backend
cd backend && npx tsc -p tsconfig.json --noEmit && npx vitest run
# lint sécu
npx eslint . --config eslint.config.js
```
