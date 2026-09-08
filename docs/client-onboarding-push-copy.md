# Onboarding client — copies des push de relance (#34)

Relances envoyées par `backend/cron/onboarding-nudge.ts` aux clients dont
l'onboarding est **commencé mais non terminé** et qui **n'ont encore réservé
aucun RDV**. Une relance par palier, jamais renvoyée (idempotent).

Respecte le réglage `client_notification_settings.offers` (le client peut couper
ces notifications). S'arrête dès que le client réserve.

---

## Où modifier

**Marketing :** proposer les nouvelles copies ici (PR ou ticket). Un dev les
reporte dans la constante `NUDGES` de `backend/cron/onboarding-nudge.ts` puis
redéploie le backend. Pas de CMS pour l'instant.

Variables disponibles à l'envoi : `{prenom}` (first_name du client),
`{pro}` (nom de la 1ᵉʳ pro recommandée), `{ville}` (ville saisie à l'onboarding),
`{creneaux_semaine}` (compteur `open_slots.this_week` de la 1ᵉʳ pro).
Si une variable est vide, prévoir une formulation de repli.

---

## Copies actuelles

| Palier | Titre | Corps | Deep link |
|---|---|---|---|
| **J+1** | `Tes ongles t'attendent 💅` | `{prenom}, tu as découvert tes pros nails recommandées ?` → repli sans prénom : `Tu as découvert tes pros nails recommandées ?` | `/onboarding` |
| **J+3** | `Encore là ?` | `Il reste {creneaux_semaine} créneaux chez {pro} cette semaine.` → repli si compteur/pro absents : `Les meilleures ongleries partent vite — jette un œil à tes recommandations.` | `/onboarding` |
| **J+7** | `On garde ta place au chaud` | `Ne rate pas les nouvelles dispos près de {ville}.` → repli sans ville : `Ne rate pas les nouvelles dispos près de chez toi.` | `/onboarding` |

> Les copies déployées aujourd'hui dans `NUDGES` sont une **v0 générique**
> (sans variables) le temps que le mobile envoie `first_name` / `ville` /
> compteur au cron. Cf. `onboarding-nudge.ts` → à faire évoluer vers les copies
> ci-dessus une fois les variables disponibles.

## Règles

- Fréquence max : 3 push sur 7 jours, puis stop.
- Fenêtre d'envoi : le cron tourne à l'heure ; ne pas envoyer entre 22h et 8h
  (heure locale client) — **à ajouter** si le volume le justifie (pas fait en v0).
- Ton : tutoiement, léger, jamais culpabilisant. Pas de fausse urgence
  (« plus que 1 place !! ») sauf si le compteur réel le dit.
- Pas d'offre promo (contrainte produit : Blyss ne fait pas d'offre de bienvenue).
