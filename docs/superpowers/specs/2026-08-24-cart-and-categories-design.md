# Panier (cart) + Catégories produit — Design

Date: 2026-08-24
Status: Approuvé (validé en dialogue avant écriture)

## Contexte

Deux fonctionnalités indépendantes demandées pour le store client-facing (dark theme,
`src/app/(store)/**`) et le dashboard admin Éclat (`src/app/(platform)/dashboard/**`) :

1. **Panier (panier)** — le client peut ajouter plusieurs produits en parcourant un store
   et confirmer une seule commande groupée, uniquement quand il a plusieurs articles
   (sinon le flux actuel mono-produit reste inchangé).
2. **Catégories produit** — l'admin crée des catégories, assigne un produit à une
   catégorie, et la page produit affiche automatiquement d'autres produits de la même
   catégorie ("vous aimerez aussi") pour encourager la navigation.

État actuel (vérifié) : aucun concept de panier n'existe (commande = un seul
`product_id` posté à `/api/orders` via `OrderFormFields`/`StoreOrderModal`), et aucun
concept de catégorie n'existe dans `Product` (`src/types/database.ts`).

## Contrainte projet

CLAUDE.md interdit `localStorage`/`sessionStorage` dans les composants (règle
critique #4). Le panier persiste donc via un **cookie client léger** (pas dans le
dashboard — uniquement sur les pages store publiques), pas via localStorage.

---

## Partie A — Panier

### Modèle de données

- Nouvelle table `order_items` (migration `061_order_items.sql`) :
  `id, order_id (FK orders), product_id (FK products), variant_id, color, size,
  quantity, unit_price, subtotal, created_at`. RLS : lisible/écrivable selon le
  `store_id` de la commande parente (suit le pattern `002_rls.sql`/`036_*`).
- **Compat descendante** : la table `orders` et son trigger `validate_order_insert`
  (migration 033) ne changent pas de comportement pour les commandes mono-produit.
  Une commande créée depuis le panier avec ≥2 articles distincts est enregistrée avec
  `orders.product_id = NULL`, `orders.quantity` = total d'unités, `orders.unit_price =
  NULL`, `orders.total_price` = somme des sous-totaux + livraison ; le détail par
  article vit dans `order_items`. Une commande à 1 seul article (même via le panier)
  garde le format actuel (`product_id` rempli, pas de lignes `order_items`) pour ne
  rien casser côté courrier (Yalidine/ZR/Maystro), fraud-scan IA, stats produit et
  A/B testing qui lisent aujourd'hui `orders.product_id` directement.
- `/api/orders` (POST) : accepte soit le payload actuel (mono-produit, inchangé) soit
  un nouveau payload `{ items: [{product_id, variant, color, size, quantity}], ... }`
  quand `items.length > 1`. Le prix serveur est toujours recalculé côté trigger/route,
  jamais fait confiance au client (règle existante).
- Dashboard commandes (`/dashboard/orders`, `[id]`) : la vue détail affiche la liste
  des articles quand `order_items` existe pour la commande, sinon l'affichage actuel
  mono-produit. Le libellé colis pour les étiquettes courrier agrège les articles
  ("Couverture x2, Oreiller x1").

### Frontend store (client-facing)

- `StoreCartProvider` (React Context, nouveau `src/components/store/cart/`) qui
  englobe le layout store public. État : liste `{productId, landingPageSlug, name,
  image, unitPrice, color, size, variantId, quantity}[]`. Persistance via un cookie
  (`krenix_cart_<storeSlug>`, JSON, pas de httpOnly puisqu'écrit côté client) pour
  survivre à la navigation entre `/p/[slug]` et l'accueil du store — panier global au
  store, pas limité à une page.
- Bouton "Ajouter au panier" sur la page produit, à côté du CTA "Commander"
  existant (qui reste le chemin rapide mono-produit inchangé — un clic direct sur
  "Commander" n'a jamais besoin du panier).
- Icône panier + badge (nombre d'articles) dans le header/nav de chaque thème store.
  Comme les 5 thèmes ont chacun leur propre header, un composant partagé
  `<CartButton theme={...} />` lit `theme.config.colors` (comme `StoreOrderModal`)
  pour rester cohérent visuellement par thème, inséré dans le header de chacun des 5
  templates.
- Le panier (drawer/modal) ne s'affiche/se déclenche que s'il contient **au moins 2
  articles** — avec 0 ou 1 article, l'icône reste discrète mais cliquer dessus avec 1
  seul article redirige simplement vers le flux `StoreOrderModal` existant pour cet
  article (pas de nouvelle UI de confirmation à maintenir pour le cas simple).
- Avec ≥2 articles : "Confirmer ma commande" ouvre une version adaptée
  d'`OrderFormFields` qui collecte les infos client une seule fois (nom, téléphone,
  wilaya, commune, type livraison) + récapitule la liste d'articles avec un total,
  puis POST vers `/api/orders` avec le payload `items[]`.

---

## Partie B — Catégories produit

### Modèle de données

- Nouvelle table `categories` (migration `061_order_items.sql` ou `062_categories.sql`
  — deux migrations séparées, num suivant après le plus haut existant `060`) :
  `id, store_id (FK stores), name, slug, created_at`. Unique `(store_id, slug)`. RLS
  scoped par `store_id` comme les autres tables tenant.
- `products.category_id` (nullable FK vers `categories.id`, `ON DELETE SET NULL`) —
  **une seule catégorie par produit** (pas de many-to-many).

### Admin (dashboard, Éclat light theme, tokens `dash-*`)

- Nouvelle page `/dashboard/products/categories` : liste simple des catégories du
  store (créer / renommer / supprimer), pattern `Card`/`StatusBadge` existants.
  Suppression bloquée (ou catégorie mise à NULL sur les produits) si des produits y
  sont encore rattachés — mise à NULL, cohérent avec la règle "jamais supprimer les
  données client silencieusement".
- Formulaire produit (`/dashboard/products/new` et `[id]`) : nouveau
  `<CategorySelect>` (dropdown) à côté du picker de badges existant, + option
  "+ Créer une catégorie" inline (petit modal) pour ne pas devoir quitter le
  formulaire. Écrit directement via le client Supabase (même pattern que le reste du
  formulaire, pas de nouvelle API route nécessaire).

### Storefront — produits liés

- Sur la page produit (`/p/[slug]` → `ThemedLanding` → template du thème), nouvelle
  section "Vous aimerez aussi" affichée sous le contenu principal (avant footer),
  listant jusqu'à 8 autres produits **du même store et de la même catégorie**
  (excluant le produit courant), chacun cliquable vers son propre `/p/[slug]`. Query
  ajoutée côté server component qui charge déjà le produit (pas de round-trip client
  supplémentaire).
- Composant partagé `<RelatedProducts theme={...} products={...} />` inséré dans
  chacun des 5 templates de thème (`themes/{tech,sport,car,home,beauty}/*Landing.tsx`)
  ainsi que dans `StandaloneProductView.tsx` pour la route produit non-landing-page.
  Si aucun autre produit ne partage la catégorie (ou pas de catégorie assignée), la
  section ne s'affiche pas du tout (pas d'état vide visible ici, contrairement à la
  règle générale dashboard — c'est une section optionnelle de découverte, pas un
  écran principal).

---

## Hors scope (explicitement exclu)

- Pas de gestion de stock partagé/réservation lors de l'ajout au panier (le stock est
  décrémenté à la confirmation de commande, comme aujourd'hui).
- Pas de sous-catégories / hiérarchie de catégories — une seule liste plate par store.
- Pas de filtrage catalogue par catégorie sur la page d'accueil du store (uniquement
  le bloc "vous aimerez aussi" sur la page produit) — pourrait être une itération
  future.
