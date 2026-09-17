# Touba Quincaillerie Sarr & Frère — gestion de stock

Application complète de gestion de stock pour quincaillerie : articles,
ventes (point de vente), fournisseurs, mouvements de stock et rapports.
Pensée pour un usage par une seule personne (le propriétaire).

**Fonctionne entièrement sans connexion Internet.** Une fois installée,
l'application n'a besoin d'aucun accès réseau pour fonctionner au
quotidien — tout (police, icônes, données) est stocké localement sur
l'ordinateur. Seule l'installation initiale (`npm install`, une fois)
nécessite une connexion, pour télécharger les quelques fichiers requis.

## Prérequis

Node.js (version 14 ou plus récente). Vérifie avec :
```bash
node -v
```

## Installation

```bash
npm install
```
Ça installe `better-sqlite3`, la base de données utilisée par l'application
(télécharge un petit binaire précompilé — pas besoin de compilateur sur la
plupart des systèmes).

## Lancer l'application

**Pour le gérant, au quotidien** : double-clique simplement sur :
- `demarrer-windows.bat` sur Windows
- `demarrer-mac.command` sur Mac
- `demarrer-linux.sh` sur Linux

Le script vérifie que tout est prêt, démarre l'application et l'ouvre
directement dans le navigateur. Pour l'arrêter, il suffit de fermer la
fenêtre noire qui s'est ouverte.

**Pour toi, en ligne de commande** (identique) :
```bash
node server.js
```
Puis ouvre **http://localhost:3001**

⚠️ **Mot de passe par défaut : `quincaillerie123`** — change-le avant de
remettre l'application, l'app elle-même affiche un avertissement tant que
ce n'est pas fait :
```bash
APP_PASSWORD=tonMotDePasse node server.js
```
Si tu utilises un des scripts de démarrage ci-dessus, ajoute cette ligne au
tout début du fichier `.bat`/`.command`/`.sh` :
```
set APP_PASSWORD=tonMotDePasse
```
(remplace `set` par `export` sur Mac/Linux)

Port personnalisé :
```bash
PORT=8080 node server.js
```

## Importer tes 600 articles

Le plus rapide pour démarrer : va dans **Articles → Importer un CSV**, et
colle ou glisse un fichier avec ces colonnes (l'ordre n'a pas d'importance,
les accents en français sont aussi reconnus) :

```csv
name,reference,category,unit,purchasePrice,salePrice,quantity,minStock,supplier
Marteau menuisier 500g,MAR-500,Outillage,pièce,2000,3500,25,5,Quincaillerie Fall
Tuyau PVC 2m,TUY-PVC2,Plomberie,pièce,1200,2000,40,10,Quincaillerie Fall
Peinture blanche 5L,PEI-BL5,Peinture,litre,8000,12000,15,3,Sénégal Peintures
```

- **name** (obligatoire) : nom de l'article
- **reference** : ta référence interne — si elle existe déjà, l'article est **mis à jour** au lieu d'être dupliqué (pratique pour corriger un import)
- **category**, **supplier** : créés automatiquement s'ils n'existent pas encore
- **purchasePrice** / **salePrice** : prix d'achat et de vente
- **quantity** : quantité actuelle en stock
- **minStock** : seuil en dessous duquel l'article apparaît en "stock bas"

Tu peux réimporter le même fichier autant de fois que tu veux pour corriger
des erreurs — les articles avec la même référence sont mis à jour, pas dupliqués.

## Fonctionnalités

- **Tableau de bord** : valeur du stock, alertes stock bas, ventes du jour et du mois
- **Articles** : recherche, filtre par catégorie, filtre stock bas, ajout/modification/suppression, import CSV en masse
- **Point de vente** : recherche d'article, panier, encaissement — décrémente le stock automatiquement, empêche de vendre plus que le stock disponible, et propose l'impression d'un reçu (case à cocher, activée par défaut)
- **Ventes** : historique complet, détail de chaque vente, **annulation d'une vente** (remet automatiquement les articles en stock, garde la vente dans l'historique marquée « Annulée » plutôt que de la supprimer — elle n'est plus comptée dans le chiffre d'affaires)
- **Fournisseurs** : liste avec nombre d'articles associés, ajout/modification/suppression
- **Mouvements de stock** : historique de toutes les entrées/sorties (achats, ventes, casse, corrections d'inventaire, annulations), avec possibilité d'ajuster manuellement
- **Rapports** : valeur du stock, marge potentielle, top 10 des articles les plus vendus (par semaine/mois/depuis toujours)
- **Sauvegardes** : copie automatique quotidienne de toute la base, téléchargeable en un clic

Tous les formulaires sont validés (côté navigateur et côté serveur).

## Structure

```
stockpro/
├── server.js          → serveur HTTP + API REST
├── db.js               → base de données SQLite (schéma + requêtes)
├── package.json
├── data/
│   └── stockpro.db       → toutes tes données (créé automatiquement)
├── public/
│   ├── index.html        → l'application (une seule page)
│   ├── style.css
│   ├── validators.js       → règles de validation des formulaires
│   └── app.js               → toute la logique de l'application
└── README.md
```

## Sauvegarder tes données

**C'est automatique** — une copie de sécurité de toute la base (stock, ventes,
fournisseurs) est faite dès que le serveur démarre, puis toutes les 24h. Les
14 sauvegardes les plus récentes sont gardées, dans `data/backups/`.

Depuis l'application, onglet **Sauvegardes** : liste des copies disponibles,
bouton pour en faire une manuellement à tout moment, et téléchargement en un
clic — utile pour en garder une copie sur une clé USB ou dans le cloud, en
plus de celles gardées sur l'ordinateur.

Réglages possibles (optionnel) :
```bash
BACKUP_KEEP=30 BACKUP_INTERVAL_HOURS=12 node server.js
```

## Aller plus loin (si besoin un jour)

- Plusieurs comptes utilisateurs (actuellement : un seul mot de passe partagé)
- Génération de tickets de caisse imprimables / facture PDF
- Codes-barres (scan à la vente)
- Alertes automatiques par SMS/email en cas de stock bas
- Hébergement en ligne pour un accès à distance (aujourd'hui : local uniquement)
