# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Blyss, please report it **responsibly**.

**Contact:** security@blyssapp.fr
**Response time:** We aim to acknowledge reports within **48 hours** and provide a resolution timeline within **7 business days**.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### What to include in your report

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected version(s) or endpoints
- Any proof-of-concept (optional)

### Responsible Disclosure Process

1. You report the vulnerability to security@blyssapp.fr
2. We acknowledge within 48h
3. We investigate and assess severity
4. We develop and deploy a fix
5. We notify you when the fix is live
6. Public disclosure after fix (coordinated with reporter)

### Scope

**In scope:**
- app.blyssapp.fr (production frontend)
- API backend at api.blyssapp.fr
- Authentication and session management
- Payment flows (Stripe integration)
- Data privacy / RGPD compliance issues

**Out of scope:**
- Denial of Service attacks
- Social engineering
- Physical attacks
- Issues in third-party services (Stripe, Supabase, RevenueCat, Sentry)

### Bug Bounty

We do not currently offer a monetary bug bounty program, but we will acknowledge your contribution in our security changelog and provide a letter of recognition upon request.

---

## Security Measures

- JWT tokens stored as HttpOnly cookies (SameSite: Strict)
- JWT signés/vérifiés avec `algorithm` HS256, `issuer` et `audience` explicites
  et constants (`backend/lib/tokens.ts`)
- Passwords hashed with bcrypt (cost factor 12)
- IBAN encrypted with AES-256-GCM (random IV per record)
- Rate limiting on all auth endpoints
- Zod validation on all inputs
- Helmet.js security headers
- CORS allowlist
- Row-Level Security (Supabase RLS)
- Automated security scanning in CI/CD (Semgrep, CodeQL, Gitleaks, npm audit)

### Analyse statique — source de vérité

L'analyse **CodeQL de référence** est celle exécutée par le workflow
`.github/workflows/security-audit.yml` — check **« CodeQL Analysis »**. C'est
elle, et elle seule, qui doit figurer dans les *required status checks* de la
protection de branche.

Le check **« CodeQL » de GitHub Advanced Security** (sans workflow, qui évalue
le SARIF ci-dessus contre le diff d'une PR) est **consultatif uniquement** : il
ne dispose pas de baseline sur les branches de PR et réattribue le backlog
préexistant du monolithe à chaque PR touchant `server.ts` ou les routes. Il
**ne doit pas** être utilisé comme référence, ni figurer dans les *required
checks*. Le *default setup* CodeQL est désactivé (`state: not-configured`) et
ne doit pas être réactivé.

Idem pour le check **« Semgrep OSS » (GHAS)** : la référence est le job
**« SAST (Semgrep) »** de `security-audit.yml`.

Le backlog CodeQL/Semgrep restant est suivi dans l'issue #14 et ses
sous-tickets.

---

*Last updated: 2026-09-04*
