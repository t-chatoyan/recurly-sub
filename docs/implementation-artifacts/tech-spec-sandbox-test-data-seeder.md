---
title: 'Recurly Sandbox Test Data Seeder'
slug: 'sandbox-test-data-seeder'
created: '2026-01-21'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['Node.js 20+', 'JavaScript (CommonJS)', 'dotenv', 'native https']
files_to_modify: ['seed.js (new)', 'src/api/accounts.js (extend)', 'src/seed/random.js (new)', 'src/seed/args.js (new)', 'src/seed/plan-manager.js (new)', 'src/seed/subscription-manager.js (new)']
code_patterns: ['parseArgs pattern', 'createClient factory', 'loadConfig pattern', 'JSDoc comments']
test_patterns: ['node:test', 'manual sandbox validation']
---

# Tech-Spec: Recurly Sandbox Test Data Seeder

**Created:** 2026-01-21

## Overview

### Problem Statement

Pour tester le script de rescue, il faut des données réalistes sur la sandbox Recurly. Actuellement, pas moyen de générer rapidement des comptes de test dans différents états (closed légitimes, closed problématiques, actifs).

### Solution

Créer un script `seed.js` standalone qui génère via l'API Recurly v3 un volume paramétrable (100-1000+) de comptes de test avec :
- Mix d'états : `closed` légitimes, `closed` par dunning (ciblés par rescue), `active`
- Données random (noms, emails, dates)
- Currency fixe EUR ou random si multi-devise
- Dates de fermeture paramétrables (start/end en CLI)
- Création de subscriptions associées, avec un plan par défaut à 39,90 si absent

### Scope

**In Scope:**
- Script `seed.js` séparé
- Génération 100-1000+ comptes
- 3 types de comptes : closed légitime, closed dunning, active
- Random data (emails, names, etc.)
- Support `--project` pour cibler le bon site
- Paramètres `--start-date` et `--end-date` pour les dates de fermeture
- Mode `--currency=EUR` ou `--currency=random` (multi-devise)
- Paramètre `--count=N` pour le volume
- Dry-run mode pour voir ce qui serait créé
- Création de subscriptions pour les comptes seedés
- Création automatique d’un plan par défaut (39,90) si absent

**Out of Scope:**
- Modification de `rescue.js`
- Cleanup/suppression des données de test
- UI fancy (progress bar etc.)
- Tests unitaires (script utilitaire one-shot)
- Variantes de pricing avancées (add-ons, ramp pricing, tax)

## Context for Development

### Codebase Patterns

**CLI Entry Point Pattern (from rescue.js):**
- Shebang `#!/usr/bin/env node`
- Parse args first, validate, exit on error
- Load config via `loadConfig(options.env)`
- Initialize client via `createClient({ apiKey, projectConfig, ... })`
- Main async function with try/catch

**Argument Parsing Pattern (from args.js):**
- `KNOWN_ARGS` array for validation of unknown args
- `parseArgs(argv)` extracts options with defaults
- Validation after parsing (required, conflicts)
- Return options object

**API Client Pattern (from recurly-client.js):**
- Factory: `createClient({ apiKey, projectConfig, ... })`
- Interface: `client.request(method, path, { body? })`
- Headers set automatically (auth, Accept, Content-Type, X-Recurly-Site)
- Retry/rate-limit handled internally

**Project Config Pattern (from projects.js):**
- `getProjectConfig(projectId)` returns { id, name, siteId, currency }
- Project `eur` = fixed EUR, project `multi` = null currency (multi)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `rescue.js` | Entry point pattern, main flow structure |
| `src/cli/args.js` | CLI argument parsing pattern |
| `src/config/env.js` | .env loading, loadConfig() |
| `src/config/projects.js` | Project definitions, getProjectConfig() |
| `src/api/recurly-client.js` | API client factory, request interface |
| `src/api/accounts.js` | Account query operations (extend for create/deactivate) |
| `src/rescue/subscription-manager.js` | Subscription creation pattern |
| `src/rescue/plan-manager.js` | Plan creation pattern |

### Technical Decisions

1. **Standalone script** → `seed.js` at root level (like `rescue.js`)
2. **Reuse existing modules** → `loadConfig`, `createClient`, `getProjectConfig`
3. **Extend accounts.js** → Add `createAccount()` and `deactivateAccount()` functions
4. **Account types distribution** → `--ratio=active:legit:dunning` (default `40:30:30`, sum=100)
5. **Type labeling** → Prefix account codes with `seed-active-`, `seed-legit-`, `seed-dunning-` for easy filtering
6. **Random data** → Simple random generation (no external libs like faker)
7. **Recurly API for accounts (per `api-index.md`):**
   - Create: `POST /accounts` with { code, email, first_name, last_name }
   - Update: `PUT /accounts/{account_id}` (no state/closed_at fields)
   - Deactivate: `DELETE /accounts/{account_id}` (sets account to inactive)
8. **Account identifiers** → Use `code-<account_code>` for path params when operating by code (see notes endpoint)
9. **Dunning simulation** → Use deactivation + account code prefix to indicate type; no documented `closed_at` for accounts in OpenAPI, so treat date range as metadata/logging only
10. **Plan par défaut (39,90)** → Créer un plan `seed-plan-3990` (mensuel) si absent, avec `unit_amount: 39.90`, `interval_unit: months`, `interval_length: 1`
11. **Multi-currency** → Si `--currency=random`, utiliser une liste fixe (ex: `EUR`, `USD`, `GBP`) et créer le plan avec pricing pour chaque currency
12. **Subscriptions** → `POST /subscriptions` avec `plan_code`, `account`, `currency`, `collection_method=manual` pour éviter la billing info

## Implementation Plan

### Tasks

1. **Add seed CLI parser**  
   - Create `src/seed/args.js` following `src/cli/args.js` style  
   - Supported args: `--env=`, `--project=`, `--count=`, `--currency=EUR|random`, `--start-date=YYYY-MM-DD`, `--end-date=YYYY-MM-DD`, `--ratio=active:legit:dunning`, `--dry-run`, `--help`  
   - Validate: required `--env`/`--project`, count > 0, ratio sums to 100, start <= end, currency=random allowed only when project currency is null  
   - Return normalized options object with defaults (count=100, ratio=40:30:30)

2. **Random data helpers**  
   - Create `src/seed/random.js` with helpers for:  
     - `randomName()`  
     - `randomEmail()` (unique-ish, include seed prefix)  
     - `randomCurrency(allowed)`  
     - `randomDate(start, end)`  
     - `randomAccountCode(prefix)`  
   - Define `ALLOWED_CURRENCIES = ['EUR', 'USD', 'GBP']` for multi-currency randomness

3. **Extend accounts API**  
   - Update `src/api/accounts.js` to export:  
     - `createAccount(client, payload)` → `POST /accounts`  
     - `deactivateAccount(client, accountCode)` → `DELETE /accounts/{account_id}` (use `code-<code>` in path, ignore 422 "already inactive")  
     - (Optional) `addAccountNote(client, accountCode, note)` → `POST /accounts/{account_id}/notes` to tag dunning/legit if needed

4. **Seed plan manager**  
   - Create `src/seed/plan-manager.js` (pattern from `src/rescue/plan-manager.js`)  
   - `getSeedPlanCode()` → `seed-plan-3990`  
   - `buildSeedPlanPayload(currencies)` → monthly plan, `unit_amount: 39.90`, `interval_unit: months`, `interval_length: 1`  
   - `findOrCreateSeedPlan(client, currencies)` → GET `/plans/{code}`, create if missing, tolerate 422 "already taken"

5. **Subscription helper**  
   - Create `src/seed/subscription-manager.js`  
   - `createSubscription(client, { accountCode, planCode, currency })` → `POST /subscriptions` with `{ plan_code, currency, collection_method: 'manual', account: { code } }`

6. **Implement seed script**  
   - Add root `seed.js` using the same entry pattern as `rescue.js`  
   - Flow: parse args → load config → get project config → create client  
   - Resolve allowed currencies (EUR-only vs multi using `ALLOWED_CURRENCIES`) and ensure plan has pricing for all possible currencies  
   - Find or create the default plan before creating subscriptions  
   - Compute counts per type from ratio (floor each bucket, distribute remainder in order: active, legit, dunning)  
   - For each account: create account → create subscription → deactivate if type is `legit` or `dunning`  
   - Use date range only for closed types; include in logs (no `closed_at` field documented for accounts)  
   - (Optional) create account note with `type` + `closed_at` to preserve metadata  
   - Dry-run: do not call API; print summary + sample payloads

### Acceptance Criteria

1. Given `seed.js --env=sandbox --project=eur --count=10`, when run without `--dry-run`, then 10 accounts are created and logged, with distribution following the 40/30/30 default and deterministic rounding.  
2. Given `--ratio=50:25:25`, when run, then counts per type follow the ratio and sum to `--count`.  
3. Given `--currency=random` on `project=multi`, when run, then accounts use a mix of allowed currencies; and for `project=eur`, it fails validation with a clear error.  
4. Given `--start-date` and `--end-date`, when creating closed accounts, then the script logs a `closed_at` value within the range (metadata/logging only, not sent to API).  
5. Given a deactivate call on an already inactive account, when run, then it logs a warning and continues (no hard failure).  
6. Given no seed plan exists, when run, then a plan `seed-plan-3990` is created with monthly pricing `39.90` in the required currencies.  
7. Given a run creates accounts, when inspecting subscriptions, then each account has a subscription using the seed plan and `collection_method=manual`.  
8. Given `--dry-run`, when run, then no API requests are made and a summary is printed.  
9. Given an invalid arg or date range, when run, then the script exits with a clear validation error.  
10. Given a run creates accounts, when inspecting codes, then each account code is prefixed with `seed-active-`, `seed-legit-`, or `seed-dunning-`.

## Additional Context

### Dependencies

- `.env` must define `RECURLY_SANDBOX_API_KEY` or `RECURLY_PRODUCTION_API_KEY`  
- Optional `.env` overrides: `RECURLY_API_BASE_URL`, `RETRY_COUNT`, `RETRY_BACKOFF_BASE`, `RETRY_BACKOFF_MAX`  
- `src/config/projects.js` must have correct `siteId` for the target project to set `X-Recurly-Site`
- `api-index.md` confirms account lifecycle uses `POST /accounts` + `DELETE /accounts/{account_id}` (no account `closed_at`)
- `api_reference/account/index.md` confirms `POST /accounts`, `DELETE /accounts/{account_id}`, and `PUT /accounts/{account_id}/reactivate`
- `api_reference/note/index.md` confirms account notes and that `account_id` path can use `code-<account_code>`
- `api_reference/subscription/index.md` + `api_reference/plan/index.md` list subscription/plan endpoints if we extend seeding to subscriptions
- `openapi-recurly.yaml` specifies required fields for `PlanCreate` (code, name, currencies) and `SubscriptionCreate` (plan_code, account, currency)

### Testing Strategy

Script utilitaire one-shot - validation manuelle sur sandbox uniquement.

### Notes

- Le script réutilisera le client Recurly existant (`src/api/recurly-client.js`)
- La configuration projet existante (`src/config/projects.js`) sera réutilisée
- Attention: `queryClosedAccounts` filtre `state === 'closed'` et `closed_at`. L’OpenAPI n’indique pas `closed_at` pour les comptes (state `active`/`inactive`). Vérifier sur sandbox et ajuster si nécessaire pour que les comptes seedés soient détectés.
- Attention: `DELETE /accounts/{account_id}` annule les abonnements actifs et supprime les infos de billing (docs account deactivate).

## Review Notes

- Adversarial review completed: 2026-01-21
- Findings: 8 total, 4 fixed (F2-F5), 4 skipped (F1 out of scope, F6-F8 low severity)
- Resolution approach: auto-fix

### Fixes Applied
- F2: Improved 422 error detection robustness (case-insensitive, multiple patterns)
- F3: Improved account code uniqueness with counter to prevent collisions
- F4: Wrapped errors instead of mutating original error objects
- F5: Blocked production environment for safety
