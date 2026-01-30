# RecurlyRescue

CLI tool to recover subscriptions closed by Recurly's dunning process.

*Outil CLI pour récupérer les abonnements fermés par le processus de relance de Recurly.*

---

## Table of Contents / Sommaire

- [English Documentation](#english-documentation)
- [Documentation Française](#documentation-française)

---

# English Documentation

## Overview

RecurlyRescue is a Node.js CLI tool designed to automatically recover customer accounts that have been closed due to failed payments (dunning process). It identifies accounts with expired subscriptions due to non-payment and creates new rescue subscriptions to re-engage these customers.

## Features

- **Automatic Detection**: Finds accounts with subscriptions expired due to non-payment
- **Batch Processing**: Process multiple accounts with pagination support
- **Single Client Mode**: Target a specific client for rescue
- **Dry-Run Mode**: Simulate operations without making changes
- **Rollback Support**: Undo rescue operations if needed
- **Statistics**: Analyze rescued clients' payment status
- **Resume Capability**: Continue interrupted operations from state file
- **Random Selection**: Randomly select clients for A/B testing

## Prerequisites

- Node.js 18+
- npm
- Recurly API access (API key with read/write permissions)

## Installation

```bash
git clone https://github.com/mus-inn/RecurlyRescue.git
cd RecurlyRescue
npm install
```

## Configuration

Create a `.env` file in the project root:

```env
# Production API
RECURLY_API_KEY_PRODUCTION=your_production_api_key

# Sandbox API (for testing)
RECURLY_API_KEY_SANDBOX=your_sandbox_api_key
```

## Usage

### Basic Rescue Command

```bash
node rescue.js --env=<sandbox|production> --project=<id> [options]
```

### Required Arguments

| Argument | Description |
|----------|-------------|
| `--env=<sandbox\|production>` | Target environment |
| `--project=<id>` | Project identifier (e.g., `eur`, `multi`) |

### Optional Arguments

| Argument | Description |
|----------|-------------|
| `--dry-run` | Simulate without making changes |
| `--client-id=<id>` | Target a single client by account code |
| `--start-date=YYYY-MM-DD` | Start of date range for account search |
| `--end-date=YYYY-MM-DD` | End of date range for account search |
| `--limit=<n>` | Maximum number of clients to process |
| `--random` | Randomize client selection (use with --limit) |
| `--price=<amount>` | Custom price for rescue plan (default: 39.90) |
| `--no-trial` | Charge immediately without trial period |
| `--confirm-every=<n>` | Pause for confirmation every N clients (default: 100) |
| `--no-confirm` | Run continuously without pauses |
| `--resume` | Resume from previous state file |
| `--rollback=<file>` | Rollback from a rescue results file |
| `--help` | Display help information |

### Examples

#### Dry-run on production (recommended first step)
```bash
node rescue.js --env=production --project=eur --start-date=2025-12-01 --end-date=2025-12-31 --dry-run
```

#### Rescue with limit and random selection
```bash
node rescue.js --env=production --project=eur --start-date=2025-12-01 --end-date=2026-01-15 --limit=100 --random --dry-run
```

#### Rescue a single client
```bash
node rescue.js --env=production --project=eur --client-id=a7782b97-8119-4a69-930c-23114fcccbd4 --dry-run
```

#### Execute rescue (no dry-run)
```bash
node rescue.js --env=production --project=eur --start-date=2025-12-01 --end-date=2026-01-15 --limit=50
```

#### Resume interrupted operation
```bash
node rescue.js --env=production --project=eur --resume
```

#### Rollback rescue operations
```bash
node rescue.js --env=production --project=eur --rollback=rescue-results-eur-2026-01-23.json
```

## Statistics Command

Analyze the payment status of rescued clients by querying the Recurly API.

```bash
node stats.js --env=<sandbox|production> --project=<id> <rescue-results.json>
```

### Example

```bash
node stats.js --env=production --project=eur rescue-results-eur-2026-01-23T16-01-00.json
```

### Output

The stats command displays:
- **PAID**: Clients whose latest invoice is paid
- **PAST_DUE**: Clients with failed/past_due invoices
- **CLOSED**: Accounts that have been closed

It also generates URL files for each category:
- `stats-paid-eur-TIMESTAMP.txt`
- `stats-past-due-eur-TIMESTAMP.txt`
- `stats-closed-eur-TIMESTAMP.txt`

## Output Files

### Rescue Results
- `rescue-results-{project}-{timestamp}.json` - Detailed results of rescue operation
- `rescue-urls-{project}-{timestamp}.txt` - URLs for manual verification

### State Files
- `rescue-state-{project}-{timestamp}.json` - State file for resume capability

## How It Works

1. **Query Accounts**: Searches for accounts updated within the specified date range
2. **Filter Candidates**: Identifies accounts with subscriptions expired due to `nonpayment`
3. **Exclude Active**: Skips accounts that already have an active subscription
4. **Verify Billing**: Checks for valid billing information
5. **Create Subscription**: Creates a new "Rescue Plan" subscription
6. **Record Results**: Logs all operations for rollback capability

## Safety Features

- Production environment requires confirmation prompt
- Dry-run mode for safe testing
- State files enable resume after interruption
- Rollback capability to undo operations
- Rate limiting compliance with Recurly API

## Seed Command (Test Data)

Generate test accounts in Recurly sandbox for testing the rescue script.

```bash
node seed.js --env=<sandbox|production> --project=<id> [options]
```

### Seed Arguments

| Argument | Description |
|----------|-------------|
| `--env=<sandbox\|production>` | Target environment (required) |
| `--project=<id>` | Project identifier (required) |
| `--count=<n>` | Number of accounts to create (default: 100) |
| `--currency=<EUR\|random>` | Currency mode (default: project currency) |
| `--ratio=<active:legit:dunning>` | Distribution ratio (default: 40:30:30) |
| `--start-date=YYYY-MM-DD` | Start of simulated closed_at date range |
| `--end-date=YYYY-MM-DD` | End of simulated closed_at date range |
| `--dry-run` | Simulate without making changes |
| `--help` | Display help |

### Account Types

The seed script creates three types of test accounts:

| Type | Description |
|------|-------------|
| **active** | Active accounts with active subscription (should be ignored by rescue) |
| **legit** | Legitimately closed accounts (should be ignored by rescue) |
| **dunning** | Accounts closed due to dunning (should be rescued) |

### Seed Examples

#### Create 50 test accounts with default ratio
```bash
node seed.js --env=sandbox --project=eur --count=50 --dry-run
```

#### Create accounts with custom ratio (more dunning accounts)
```bash
node seed.js --env=sandbox --project=eur --count=100 --ratio=20:20:60
```

#### Create multi-currency test accounts
```bash
node seed.js --env=sandbox --project=multi --count=50 --currency=random
```

---

# Documentation Française

## Aperçu

RecurlyRescue est un outil CLI Node.js conçu pour récupérer automatiquement les comptes clients fermés suite à des échecs de paiement (processus de relance/dunning). Il identifie les comptes avec des abonnements expirés pour non-paiement et crée de nouveaux abonnements de sauvetage pour réengager ces clients.

## Fonctionnalités

- **Détection Automatique** : Trouve les comptes avec abonnements expirés pour non-paiement
- **Traitement par Lot** : Traite plusieurs comptes avec pagination
- **Mode Client Unique** : Cible un client spécifique pour le sauvetage
- **Mode Dry-Run** : Simule les opérations sans effectuer de changements
- **Support Rollback** : Annule les opérations de sauvetage si nécessaire
- **Statistiques** : Analyse le statut de paiement des clients sauvés
- **Reprise** : Continue les opérations interrompues depuis le fichier d'état
- **Sélection Aléatoire** : Sélectionne aléatoirement les clients pour les tests A/B

## Prérequis

- Node.js 18+
- npm
- Accès API Recurly (clé API avec permissions lecture/écriture)

## Installation

```bash
git clone https://github.com/mus-inn/RecurlyRescue.git
cd RecurlyRescue
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet :

```env
# API Production
RECURLY_API_KEY_PRODUCTION=votre_cle_api_production

# API Sandbox (pour les tests)
RECURLY_API_KEY_SANDBOX=votre_cle_api_sandbox
```

## Utilisation

### Commande de Sauvetage de Base

```bash
node rescue.js --env=<sandbox|production> --project=<id> [options]
```

### Arguments Requis

| Argument | Description |
|----------|-------------|
| `--env=<sandbox\|production>` | Environnement cible |
| `--project=<id>` | Identifiant du projet (ex: `eur`, `multi`) |

### Arguments Optionnels

| Argument | Description |
|----------|-------------|
| `--dry-run` | Simule sans effectuer de changements |
| `--client-id=<id>` | Cible un seul client par code compte |
| `--start-date=YYYY-MM-DD` | Début de la plage de dates pour la recherche |
| `--end-date=YYYY-MM-DD` | Fin de la plage de dates pour la recherche |
| `--limit=<n>` | Nombre maximum de clients à traiter |
| `--random` | Sélection aléatoire des clients (avec --limit) |
| `--price=<montant>` | Prix personnalisé pour le plan de sauvetage (défaut: 39.90) |
| `--no-trial` | Facturer immédiatement sans période d'essai |
| `--confirm-every=<n>` | Pause pour confirmation tous les N clients (défaut: 100) |
| `--no-confirm` | Exécuter en continu sans pauses |
| `--resume` | Reprendre depuis le fichier d'état précédent |
| `--rollback=<fichier>` | Annuler depuis un fichier de résultats |
| `--help` | Afficher l'aide |

### Exemples

#### Dry-run en production (première étape recommandée)
```bash
node rescue.js --env=production --project=eur --start-date=2025-12-01 --end-date=2025-12-31 --dry-run
```

#### Sauvetage avec limite et sélection aléatoire
```bash
node rescue.js --env=production --project=eur --start-date=2025-12-01 --end-date=2026-01-15 --limit=100 --random --dry-run
```

#### Sauvetage d'un seul client
```bash
node rescue.js --env=production --project=eur --client-id=a7782b97-8119-4a69-930c-23114fcccbd4 --dry-run
```

#### Exécuter le sauvetage (sans dry-run)
```bash
node rescue.js --env=production --project=eur --start-date=2025-12-01 --end-date=2026-01-15 --limit=50
```

#### Reprendre une opération interrompue
```bash
node rescue.js --env=production --project=eur --resume
```

#### Annuler des opérations de sauvetage
```bash
node rescue.js --env=production --project=eur --rollback=rescue-results-eur-2026-01-23.json
```

## Commande Statistiques

Analyse le statut de paiement des clients sauvés en interrogeant l'API Recurly.

```bash
node stats.js --env=<sandbox|production> --project=<id> <rescue-results.json>
```

### Exemple

```bash
node stats.js --env=production --project=eur rescue-results-eur-2026-01-23T16-01-00.json
```

### Sortie

La commande stats affiche :
- **PAID** : Clients dont la dernière facture est payée
- **PAST_DUE** : Clients avec des factures échouées/en retard
- **CLOSED** : Comptes qui ont été fermés

Elle génère également des fichiers d'URLs pour chaque catégorie :
- `stats-paid-eur-TIMESTAMP.txt`
- `stats-past-due-eur-TIMESTAMP.txt`
- `stats-closed-eur-TIMESTAMP.txt`

## Fichiers de Sortie

### Résultats de Sauvetage
- `rescue-results-{projet}-{timestamp}.json` - Résultats détaillés de l'opération
- `rescue-urls-{projet}-{timestamp}.txt` - URLs pour vérification manuelle

### Fichiers d'État
- `rescue-state-{projet}-{timestamp}.json` - Fichier d'état pour la reprise

## Fonctionnement

1. **Recherche des Comptes** : Recherche les comptes mis à jour dans la plage de dates
2. **Filtrage des Candidats** : Identifie les comptes avec abonnements expirés pour `nonpayment`
3. **Exclusion des Actifs** : Ignore les comptes ayant déjà un abonnement actif
4. **Vérification Facturation** : Vérifie la présence d'informations de paiement valides
5. **Création Abonnement** : Crée un nouvel abonnement "Rescue Plan"
6. **Enregistrement** : Journalise toutes les opérations pour permettre l'annulation

## Sécurité

- L'environnement production nécessite une confirmation
- Mode dry-run pour tester en toute sécurité
- Fichiers d'état pour reprendre après interruption
- Possibilité d'annulation (rollback)
- Respect des limites de l'API Recurly

## Commande Seed (Données de Test)

Génère des comptes de test dans le sandbox Recurly pour tester le script de sauvetage.

```bash
node seed.js --env=<sandbox|production> --project=<id> [options]
```

### Arguments Seed

| Argument | Description |
|----------|-------------|
| `--env=<sandbox\|production>` | Environnement cible (requis) |
| `--project=<id>` | Identifiant du projet (requis) |
| `--count=<n>` | Nombre de comptes à créer (défaut: 100) |
| `--currency=<EUR\|random>` | Mode devise (défaut: devise du projet) |
| `--ratio=<active:legit:dunning>` | Ratio de distribution (défaut: 40:30:30) |
| `--start-date=YYYY-MM-DD` | Début de la plage de dates closed_at simulée |
| `--end-date=YYYY-MM-DD` | Fin de la plage de dates closed_at simulée |
| `--dry-run` | Simule sans effectuer de changements |
| `--help` | Afficher l'aide |

### Types de Comptes

Le script seed crée trois types de comptes de test :

| Type | Description |
|------|-------------|
| **active** | Comptes actifs avec abonnement actif (ignorés par rescue) |
| **legit** | Comptes fermés légitimement (ignorés par rescue) |
| **dunning** | Comptes fermés pour dunning (à sauvegarder) |

### Exemples Seed

#### Créer 50 comptes de test avec le ratio par défaut
```bash
node seed.js --env=sandbox --project=eur --count=50 --dry-run
```

#### Créer des comptes avec un ratio personnalisé (plus de dunning)
```bash
node seed.js --env=sandbox --project=eur --count=100 --ratio=20:20:60
```

#### Créer des comptes de test multi-devises
```bash
node seed.js --env=sandbox --project=multi --count=50 --currency=random
```

---

## Project Structure / Structure du Projet

```
RecurlyRescue/
├── rescue.js              # Main rescue CLI / CLI principal de sauvetage
├── stats.js               # Statistics analyzer / Analyseur de statistiques
├── seed.js                # Test data generator / Générateur de données de test
├── src/
│   ├── api/               # Recurly API client / Client API Recurly
│   ├── cli/               # CLI argument parsing / Parsing des arguments
│   ├── config/            # Configuration / Configuration
│   ├── rescue/            # Rescue logic / Logique de sauvetage
│   ├── rollback/          # Rollback functionality / Fonctionnalité rollback
│   ├── seed/              # Seed logic / Logique de seed
│   ├── state/             # State management / Gestion d'état
│   ├── output/            # Results writer / Écriture des résultats
│   └── ui/                # Progress bar & logger / Barre de progression
├── test/                  # Unit tests / Tests unitaires
└── .env                   # Environment config / Configuration environnement
```

## License

MIT

## Support

For issues and feature requests, please open an issue on GitHub.

*Pour les problèmes et demandes de fonctionnalités, veuillez ouvrir une issue sur GitHub.*
