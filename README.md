# Formy — mini-projet Docker multi-services

Formy est un assistant numérique qui transforme les démarches administratives
françaises (CAF, impôts, France Travail, CPAM, préfecture...) en checklists
claires : vraies étapes, vrais délais, documents requis et pièges à éviter.
Ce dépôt contient une implémentation conteneurisée du projet, réalisée dans
le cadre du mini-projet "Déploiement conteneurisé multi-services".

## Scénario technique choisi

- **Conteneur 1 — `web`** : une API REST Node.js / Express (build multi-stage,
  image finale `node:20-alpine`, exécution en utilisateur non-root) qui sert
  aussi le frontend (HTML/CSS/JS, rendu partiellement côté serveur pour le
  référencement).
- **Conteneur 2 — `db`** : une base **PostgreSQL 16**, seule source de vérité,
  non exposée sur l'hôte.
- **Conteneur 3 (bonus) — `pgadmin`** : interface d'administration graphique
  de la base de données.

L'API expose l'authentification (cookies httpOnly + refresh token), le
catalogue des démarches (137 fiches réparties dans 17 catégories, avec un
lexique intégré pour expliquer les sigles administratifs), le regroupement
par événements de vie (19 situations : naissance, perte d'emploi,
déménagement, majorité...), le suivi de progression (checklist par étape,
statuts à faire / en cours / terminé, échéances) et des fonctionnalités RGPD
(export et suppression de compte).

## Lancer le projet

Prérequis : Docker et Docker Compose installés.

Il faut avoir Git, Docker et Docker Compose installés. Si le dépôt est privé, il faut également accepter l’invitation GitHub et être connecté à son compte.

1. Dans PowerShell, clone le dépôt. 

   ```powershell
   git clone https://github.com/gbetiefs-byte/formy.git
   cd formy
   ```

2. Crée le fichier `.env` à partir de l’exemple :

   ```powershell
   Copy-Item .env.example .env
   ```

   Génère un secret JWT avec Node.js :

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Copie le résultat et remplace dans `.env` la valeur de `JWT_SECRET` par ce secret. Docker Compose refuse de démarrer l’application si cette variable est absente. Node.js sert ici uniquement à générer le secret ; l’application elle-même tourne dans Docker.

3. Construis et démarre les services :

   ```powershell
   docker compose up -d --build
   ```

4. Ouvre l’application dans ton navigateur : **http://localhost:8080**

| Service | Adresse |
|---|---|
| **Application Formy** | **http://localhost:8080** |
| Vérification de l’API | http://localhost:8080/api/health |
| pgAdmin | http://localhost:8081 |

Les identifiants administrateur et pgAdmin sont configurables dans `.env`. Les valeurs fournies dans `.env.example` sont prévues pour le développement : change-les avant toute utilisation réelle. Pour ouvrir la base depuis pgAdmin, utilise l’hôte `db`, le port `5432` et les identifiants PostgreSQL renseignés dans `.env`.

Pour arrêter les services sans supprimer les données :

```powershell
docker compose down
```

Pour arrêter les services et supprimer aussi les données persistées :

```powershell
docker compose down -v
```

## Architecture

Docker Compose démarre trois services :

- **`web`** : API Node.js et Express, qui sert aussi l’interface HTML, CSS et JavaScript. Le port local `8080` est redirigé vers le port `3000` du conteneur.
- **`db`** : PostgreSQL 16. La base n’expose pas de port sur la machine hôte ; elle est accessible aux autres services sur le réseau Docker.
- **`pgadmin`** : interface graphique d’administration de PostgreSQL, accessible sur le port local `8081`.

Le Dockerfile utilise une construction multi-stage basée sur `node:20-alpine` et lance le service web avec un utilisateur non privilégié. Des contrôles de santé vérifient la disponibilité de PostgreSQL et de l’API.

## Données et initialisation

Le volume Docker `formy_db_data` conserve la base PostgreSQL entre les arrêts ou les recréations de conteneurs. Le volume `formy_pgadmin_data` conserve la configuration de pgAdmin. Seule la commande `docker compose down -v` supprime ces volumes.

Les migrations SQL versionnées se trouvent dans `db/migrations/` et sont appliquées au démarrage de l’API. Les données de référence et le compte administrateur sont initialisés automatiquement. Les démarches et le lexique sont synchronisés au démarrage.

## Sécurité et configuration

Les paramètres sont transmis aux conteneurs par variables d’environnement définies dans `.env`. Le secret JWT est obligatoire. En revanche, les mots de passe d’exemple ne sont pas adaptés à un déploiement réel : il faut les remplacer et ne pas publier le fichier `.env`.

FranceConnect est facultatif. Pour l’activer, il faut renseigner dans `.env` les paramètres du client (`FC_CLIENT_ID`, `FC_CLIENT_SECRET`, `FC_ISSUER` et `FC_REDIRECT_URI`).

## Évolution possible vers le Cloud

Pour un déploiement en production, je remplacerais la base locale par un PostgreSQL managé, je stockerais les secrets dans le gestionnaire du fournisseur Cloud et je placerais un répartiteur HTTPS devant plusieurs instances de l’application.

```mermaid
flowchart LR
    U[Utilisateurs] -->|HTTPS| LB[Répartiteur de charge]
    LB --> WEB1[Application Formy]
    LB --> WEB2[Instance supplémentaire]
    WEB1 --> DB[(PostgreSQL managé)]
    WEB2 --> DB
    WEB1 -. journaux et métriques .-> MON[Supervision Cloud]
    WEB2 -. journaux et métriques .-> MON
```

Cette architecture peut s’appuyer, par exemple, sur AWS, Azure ou Google Cloud : service de conteneurs managé, base PostgreSQL managée, gestionnaire de secrets et outil de supervision.

## Crédits

**Projet réalisé par Fresnel Gbetie, avec l’accompagnement d’Axel Houenou.**
