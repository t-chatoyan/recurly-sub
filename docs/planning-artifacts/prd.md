---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
completedAt: '2026-01-20'
inputDocuments: []
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: cli_tool
  domain: fintech
  complexity: high
  projectContext: greenfield
---

# Product Requirements Document - Recurly Rescue Script

**Author:** Gtko
**Date:** 2026-01-20
**Status:** Complete
**Version:** 1.0

## Executive Summary

**Problème :** Entre le 16/11/2025 et le 20/01/2026, un script défaillant a fermé à tort 1000+ abonnements via le bot Dunning sur 2 projets Recurly (1 EUR, 1 multi-devise).

**Solution :** CLI one-shot en JavaScript pour identifier et restaurer automatiquement ces abonnés via l'API Recurly v3, avec attribution d'un Rescue Plan + 1 jour free trial.

**Scope :** Outil jetable, usage unique par projet, supprimé après exécution. Opérateur unique (Gtko), exécution locale.

**Métriques de succès :**
| Métrique | Cible |
|----------|-------|
| Clients restaurés | 100% des identifiés |
| Corruption de données | 0 |
| Traçabilité | 100% des actions loggées |
| Rollback | Disponible automatiquement |

## Success Criteria

### User Success (Opérateur)

- Exécution complète du script sur 100% des clients identifiés
- Confiance totale grâce aux logs détaillés et au mode dry-run
- Capacité de reprendre exactement là où le script s'est arrêté en cas d'interruption
- Contrôle total via confirmations périodiques (tous les X clients)

### Business Success

- **100% des clients impactés** (période 16/11/25 → 20/01/26) remis dans le cycle d'abonnement
- Récupération du revenu perdu lié aux abonnements fermés à tort
- Zéro impact négatif sur les clients (pas de double facturation, pas de corruption)

### Technical Success

- Zéro corruption de données
- State persistant permettant reprise exacte après interruption
- Logs complets : timestamp + client ID + action + résultat pour chaque opération
- Validation API systématique (Recurly confirme chaque changement)
- Mode dry-run fonctionnel pour simulation sans risque

### Measurable Outcomes

| Métrique | Cible |
|----------|-------|
| Taux de rescue | 100% des clients identifiés |
| Corruptions | 0 |
| Traçabilité | 100% des actions loggées |
| Reprise | État exact restauré après crash |

## Product Scope

### MVP - Minimum Viable Product

1. **Identification** : Query Recurly API pour clients closés par dunning bot (16/11/25 → 20/01/26)
2. **Rescue Plan** : Création automatique si inexistant (avec bonne currency)
3. **Attribution** : Assigner Rescue Plan + 1 jour free trial à chaque client
4. **Validation** : Vérification API que Recurly a accepté le changement
5. **Logging** : Fichier de logs pour tail -f (timestamp, client ID, action, résultat)
6. **State** : Persistance de l'état pour reprise après interruption
7. **Contrôle** : Confirmation utilisateur tous les X clients (paramétrable)
8. **Dry-run** : Mode simulation sans exécution réelle

### Growth Features (Post-MVP)

- Non défini pour l'instant - focus MVP

### Vision (Future)

- Non défini pour l'instant - focus MVP

## User Journeys

### Parcours Unique : Opérateur - Rescue Mission

**Persona :** Gtko, développeur, seul opérateur du script one-shot.

**Contexte :** Outil jetable - utilisé une fois par projet puis supprimé. 2 projets Recurly à traiter (1 EUR, 1 multi-devise), 1000+ clients impactés sur la période 16/11/25 → 20/01/26.

---

#### Scène d'ouverture (Préparation)
Gtko ouvre son terminal, conscient qu'il a 1000+ clients bloqués depuis 2 mois. Il doit agir vite mais sans casser quoi que ce soit.

#### Acte 1 : Dry-run
```bash
node rescue.js --env=sandbox --project=eur --dry-run
```
Le script affiche :
- Progression avec pourcentage : `[████████░░] 80% - 800/1000 clients analysés`
- Détail par client avec checkbox : `✓ client_abc123 - Plan: Pro, Currency: EUR, Action: RESCUE`
- Récap final dry-run : "1000 clients identifiés, 987 éligibles au rescue, 13 exclus (raison)"

#### Acte 2 : Test sur échantillon (optionnel)
```bash
node rescue.js --env=sandbox --project=eur --client-id=abc123
```
Test sur 1 client spécifique pour valider le flow réel.

#### Acte 3 : Exécution réelle
```bash
node rescue.js --env=production --project=eur --confirm-every=50
# OU
node rescue.js --env=production --project=eur --no-confirm
```
- Mode avec paliers : pause tous les 50 clients, "Continuer ? (y/n)"
- Mode full : run tout d'un coup sans interruption

Affichage en temps réel :
```
[████░░░░░░] 40% - 400/1000
✓ client_abc123 - RESCUED - https://app.recurly.com/accounts/abc123
✓ client_def456 - RESCUED - https://app.recurly.com/accounts/def456
✗ client_ghi789 - FAILED (API Error: 429 Rate Limit)
```

#### Acte 4 : Résolution (Output final)

**Terminal :**
```
═══════════════════════════════════════
RESCUE COMPLETE - Project: EUR
═══════════════════════════════════════
Total clients:     1000
Rescued:           987 (98.7%)
Failed:            13 (1.3%)
Duration:          12m 34s
═══════════════════════════════════════
Output: ./rescue-results-eur-2026-01-20.json
```

**Fichier JSON/CSV :**
- Client ID
- État AVANT (pour rollback)
- État APRÈS
- URL Recurly cliquable
- Timestamp
- Résultat (SUCCESS/FAILED + raison)

#### Acte 5 : Rollback (si nécessaire)
```bash
node rescue.js --env=production --rollback=./rescue-results-eur-2026-01-20.json
```
Restaure l'état AVANT pour chaque client à partir du fichier de backup.

#### Épilogue : Vérification
Gtko ouvre le JSON, clique sur 5-10 URLs random, vérifie dans Recurly que le Rescue Plan est bien assigné. Tout est OK → script supprimé.

---

### Journey Requirements Summary

| Capability | Besoin |
|------------|--------|
| **CLI Arguments** | `--env`, `--project`, `--dry-run`, `--client-id`, `--confirm-every`, `--no-confirm`, `--rollback` |
| **Progress Display** | Barre de progression + pourcentage + compteur |
| **Action Logging** | Checkbox (✓/✗) + détail + URL cliquable |
| **Confirmation Mode** | Paliers configurables OU mode continu |
| **Output File** | JSON/CSV avec état avant/après pour rollback |
| **Terminal Recap** | Stats complètes en fin d'exécution |
| **Recurly URLs** | Liens directs vers chaque compte client |
| **Rollback Mode** | Restauration automatisée depuis fichier backup |

## Domain-Specific Requirements

### Sécurité & Credentials

- **API Keys** : Stockées dans fichier `.env`, jamais en dur dans le code
- **Variables requises** :
  - `RECURLY_SANDBOX_API_KEY` : Clé API environnement Sandbox
  - `RECURLY_PRODUCTION_API_KEY` : Clé API environnement Production
- **Validation** : Le script vérifie la présence des variables avant exécution

### Gestion des Environnements

- **Dual-environment** : Support Sandbox et Production
- **Argument CLI** : `--env=sandbox|production` (obligatoire)
- **Sécurité** : Confirmation explicite requise avant exécution en production
- **Isolation** : Impossible de mixer accidentellement sandbox et production

### Intégrité des Données

- **Pré-vérification** : Vérifier que le client n'a pas déjà un plan actif avant rescue
- **État AVANT** : Sauvegardé dans le JSON pour chaque client avant modification
- **Validation API** : Confirmation Recurly que chaque changement est accepté

### Rollback Automatisé

- **Mode rollback** : `--rollback=<path-to-json>`
- **Fonctionnement** : Lit le JSON de backup, restaure l'état AVANT pour chaque client
- **Output** : Génère `rollback-results-{project}-{date}.json`
- **Logs** : Même niveau de détail que le mode rescue (progression, checkboxes, URLs)

### Audit Trail

- **Traçabilité complète** : Chaque action loggée avec timestamp, client ID, action, résultat
- **Fichier de backup** : JSON avec état avant/après pour chaque client
- **Durée de conservation** : À la discrétion de l'opérateur (outil jetable)

## CLI Tool Specific Requirements

### Command Structure

```bash
node rescue.js [options]
```

**Arguments obligatoires :**

| Argument | Description |
|----------|-------------|
| `--env=<sandbox\|production>` | Environnement cible (requis) |
| `--project=<id>` | Identifiant du projet Recurly (requis) |

**Arguments optionnels :**

| Argument | Description |
|----------|-------------|
| `--dry-run` | Simulation sans exécution réelle |
| `--client-id=<id>` | Traiter un seul client (test) |
| `--confirm-every=<N>` | Pause tous les N clients |
| `--no-confirm` | Exécution continue sans pauses |
| `--rollback=<path>` | Rollback depuis fichier JSON |
| `--help` | Afficher l'aide |

### Argument Validation

**Combinaisons invalides (erreur) :**

- `--dry-run` + `--rollback` → "Cannot combine dry-run with rollback"
- `--confirm-every` + `--no-confirm` → "Cannot use both confirm-every and no-confirm"
- `--client-id` + `--rollback` → "Cannot combine single client with rollback"
- Missing `--env` → "Missing required argument: --env"
- Missing `--project` → "Missing required argument: --project"

**Format des erreurs :**

```
ERROR: Cannot combine --dry-run with --rollback
Run 'node rescue.js --help' for usage information.
```

### Help Output

```
Recurly Rescue Script - Recover subscriptions closed by dunning bot

Usage: node rescue.js --env=<env> --project=<project> [options]

Required:
  --env          Target environment: sandbox | production
  --project      Recurly project identifier

Options:
  --dry-run           Simulate actions without executing
  --client-id=<id>    Process a single client (for testing)
  --confirm-every=N   Pause for confirmation every N clients
  --no-confirm        Run continuously without pauses
  --rollback=<file>   Restore previous state from JSON backup
  --help              Show this help message

Examples:
  node rescue.js --env=sandbox --project=eur --dry-run
  node rescue.js --env=production --project=eur --confirm-every=50
  node rescue.js --env=production --rollback=./rescue-results-eur-2026-01-20.json
```

### Output Formats

**Terminal (temps réel) :**

- Barre de progression avec pourcentage
- Détail par client avec checkbox (✓/✗)
- URL Recurly cliquable pour chaque client
- Récap statistique en fin d'exécution

**Fichier JSON :**

```json
{
  "execution": {
    "date": "2026-01-20T14:30:00Z",
    "env": "production",
    "project": "eur",
    "mode": "rescue"
  },
  "summary": {
    "total": 1000,
    "success": 987,
    "failed": 13,
    "duration_ms": 754000
  },
  "clients": [
    {
      "id": "abc123",
      "url": "https://app.recurly.com/accounts/abc123",
      "before": { "state": "closed", "plan": null },
      "after": { "state": "active", "plan": "4weeks-subscription" },
      "result": "SUCCESS",
      "timestamp": "2026-01-20T14:30:15Z"
    }
  ]
}
```

### Config Schema

**Fichier `.env` :**

```env
RECURLY_SANDBOX_API_KEY=your-sandbox-key
RECURLY_PRODUCTION_API_KEY=your-production-key
```

**Validation au démarrage :**

- Vérifier présence de la clé API correspondant à `--env`
- Erreur claire si variable manquante

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach :** Problem-Solving MVP - Outil utilitaire one-shot qui résout un problème urgent et spécifique.

**Particularité :** Ce n'est pas un produit avec une roadmap évolutive. C'est un outil jetable à usage unique par projet Recurly. Le "MVP" EST le produit final complet.

**Resource Requirements :** 1 développeur (Gtko), exécution locale uniquement.

### MVP Feature Set (Phase 1 = Final)

**Core User Journey Supported :**
- Opérateur - Rescue Mission (dry-run → test → exécution → vérification)

**Must-Have Capabilities :**

| # | Capability | Justification |
|---|------------|---------------|
| 1 | Query clients closés par dunning (16/11/25 → 20/01/26) | Identification des cibles |
| 2 | Création Rescue Plan si inexistant | Prérequis au rescue |
| 3 | Attribution plan + 1j trial + currency | Action principale |
| 4 | Validation API Recurly | Garantie de succès |
| 5 | Logs temps réel (progression, ✓/✗, URLs) | Observabilité |
| 6 | State persistant | Reprise après crash |
| 7 | Confirmations tous les X clients | Contrôle opérateur |
| 8 | Mode dry-run | Simulation sans risque |
| 9 | Dual environment (sandbox/production) | Sécurité et tests |
| 10 | Rollback automatisé | Filet de sécurité |
| 11 | Output JSON (état avant/après) | Audit et rollback |
| 12 | --help | Utilisabilité |
| 13 | Validation des arguments | Prévention erreurs |

### Post-MVP Features

**Phase 2 (Post-MVP) :** N/A - Outil jetable, supprimé après usage.

**Phase 3 (Expansion) :** N/A - Pas de roadmap long terme.

### Risk Mitigation Strategy

| Type | Risque | Mitigation |
|------|--------|------------|
| **Technique** | Rate limiting API Recurly | Retry avec backoff exponentiel |
| **Technique** | Crash en plein batch | State persistant pour reprise exacte |
| **Données** | Action irréversible ratée | Backup état AVANT dans JSON + mode rollback |
| **Opérationnel** | Erreur de manipulation | Dry-run obligatoire + confirmation par paliers |
| **Sécurité** | Credentials exposées | .env uniquement, jamais en dur |

## Functional Requirements

### Client Identification

- **FR1:** Operator can query Recurly API to retrieve all accounts closed by dunning bot
- **FR2:** Operator can filter accounts by date range (16/11/25 → 20/01/26)
- **FR3:** Operator can target a specific Recurly project via CLI argument
- **FR4:** Operator can target a single client by ID for testing purposes

### Rescue Plan Management

- **FR5:** System can check if a Rescue Plan exists for the target currency
- **FR6:** System can create a Rescue Plan with correct currency if it doesn't exist
- **FR7:** System can assign Rescue Plan with 1-day free trial to a client account
- **FR8:** System can verify Recurly API confirms the plan assignment

### Execution Control

- **FR9:** Operator can run in dry-run mode (simulation without real changes)
- **FR10:** Operator can set confirmation intervals (pause every N clients)
- **FR11:** Operator can run in continuous mode without pauses
- **FR12:** System requests explicit confirmation before executing in production environment

### State Management

- **FR13:** System can persist execution state to enable crash recovery
- **FR14:** System can resume execution from exact point of interruption
- **FR15:** System tracks which clients have been processed vs pending

### Observability & Logging

- **FR16:** System displays real-time progress bar with percentage and counter
- **FR17:** System logs each client action with checkbox (✓/✗), details, and clickable Recurly URL
- **FR18:** System displays final execution statistics summary in terminal
- **FR19:** System generates JSON output file with before/after state for each client

### Rollback

- **FR20:** Operator can trigger rollback mode from a previous execution JSON file
- **FR21:** System can restore previous state for each client from backup data
- **FR22:** System generates rollback results file with same format as rescue results

### Configuration & Validation

- **FR23:** System reads API credentials from .env file
- **FR24:** System validates presence of required CLI arguments (--env, --project)
- **FR25:** System detects and rejects invalid argument combinations
- **FR26:** Operator can display help with usage examples via --help

### Environment Management

- **FR27:** Operator can target sandbox environment for testing
- **FR28:** Operator can target production environment for real execution
- **FR29:** System prevents accidental mixing of sandbox and production operations

## Non-Functional Requirements

### Performance & Rate Limiting

**Recurly API Rate Limits :**
- Sandbox : 400 requests/min (tous types de requêtes)
- Production : 1000 requests/min (GET uniquement)
- Fenêtre glissante de 5 minutes

- **NFR-P1:** System must respect Recurly API rate limits by monitoring `X-RateLimit-Remaining` header
- **NFR-P2:** System must implement configurable delay between API calls if approaching rate limit threshold
- **NFR-P3:** System must handle 429 (Too Many Requests) responses gracefully with automatic retry

### Reliability & Error Handling

**Retry Configuration :**
- Retries configurables via `.env` (`RETRY_COUNT`), défaut : 3
- Backoff exponentiel : 2s → 4s → 8s → 16s → 30s (cap)

- **NFR-R1:** System must retry failed API calls up to configurable limit (default: 3 retries)
- **NFR-R2:** System must implement exponential backoff between retries (2s base, 30s max)
- **NFR-R3:** System must log each retry attempt with reason and attempt number
- **NFR-R4:** System must mark client as FAILED after exhausting all retries and continue to next client
- **NFR-R5:** System must not crash on individual client failures - isolate errors per client

### Security

- **NFR-S1:** API credentials must only be loaded from `.env` file, never hardcoded
- **NFR-S2:** `.env` file must not be committed to version control (`.gitignore`)
- **NFR-S3:** System must validate API key presence before any API call
- **NFR-S4:** System must not log or display API keys in terminal output or files

### Integration (Recurly API v3)

- **NFR-I1:** System must use Recurly API v3
- **NFR-I2:** System must implement pagination for list endpoints (accounts, subscriptions)
- **NFR-I3:** System must handle pagination cursor/offset correctly to retrieve all results
- **NFR-I4:** System must parse and use rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- **NFR-I5:** System must handle API response codes appropriately:
  - 200/201: Success
  - 400: Bad request (log error, mark client failed)
  - 401: Unauthorized (stop execution, credential error)
  - 404: Not found (log, mark client failed, continue)
  - 429: Rate limited (wait and retry)
  - 5xx: Server error (retry with backoff)

### Configuration Summary (.env)

```env
# Required
RECURLY_SANDBOX_API_KEY=xxx
RECURLY_PRODUCTION_API_KEY=xxx

# Optional (with defaults)
RETRY_COUNT=3
RETRY_BACKOFF_BASE=2
RETRY_BACKOFF_MAX=30
```

