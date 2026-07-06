-- ============================================================
-- KRENIX — DEMO STORE SEED DATA
-- Migration 004: Demo Store
-- Run this AFTER 003_seed.sql
-- ============================================================
-- IMPORTANT: Run this AFTER you register your Issam's account
-- Replace 'your@email.com' with your actual registered email
-- before running this script
-- ============================================================

DO $$
DECLARE
  v_owner_id        UUID;
  v_store_id        UUID;
  v_theme_id        UUID;
  v_product_1_id    UUID;
  v_product_2_id    UUID;
  v_product_3_id    UUID;
  v_product_4_id    UUID;
  v_page_1_id       UUID;
  v_page_2_id       UUID;
  v_page_3_id       UUID;

BEGIN

-- ============================================================
-- STEP 1: Find the super admin user
-- Replace this email with YOUR registered Krenix email
-- ============================================================
SELECT id INTO v_owner_id
FROM auth.users
WHERE email = 'your@email.com'  -- ⚠️ REPLACE WITH YOUR EMAIL
LIMIT 1;

IF v_owner_id IS NULL THEN
  RAISE EXCEPTION 'User not found. Register your account first, then replace your@email.com with your real email.';
END IF;

-- ============================================================
-- STEP 2: Get the "Classique" theme ID
-- ============================================================
SELECT id INTO v_theme_id FROM themes WHERE slug = 'classique' LIMIT 1;

-- ============================================================
-- STEP 3: Create the Demo Store
-- ============================================================
INSERT INTO stores (
  id, owner_id, name, slug, theme_id, plan, subscription_status,
  ai_credits, chatbot_daily_limit, is_onboarded, settings
)
VALUES (
  gen_random_uuid(),
  v_owner_id,
  'Maison Élégance',
  'demo',
  v_theme_id,
  'ultimate',
  'active',
  100,
  150,
  TRUE,
  '{
    "primaryColor": "#F59E0B",
    "secondaryColor": "#3B82F6",
    "fontFamily": "Inter",
    "borderRadius": "rounded-xl",
    "whatsapp": "0555000000",
    "facebook": "maisonelegance.dz",
    "instagram": "maisonelegance.dz",
    "deliveryPrice": 400,
    "freeDeliveryThreshold": 3000,
    "welcomeMessage": "Bienvenue chez Maison Élégance — La qualité à votre porte!"
  }'
)
RETURNING id INTO v_store_id;

-- ============================================================
-- STEP 4: Create Demo Products
-- Realistic Algerian home textiles dropshipping products
-- ============================================================

-- Product 1: Couvre-matelas
INSERT INTO products (
  id, store_id, name, slug, description, price, compare_price,
  images, colors, sizes, stock, is_active
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  'Couvre-Matelas Imperméable Premium',
  'couvre-matelas-impermeable-premium',
  'Protégez votre matelas avec notre housse imperméable premium. Tissu respirant, anti-acariens, lavable en machine. Élastique 360° pour un maintien parfait. Idéal pour toute la famille.',
  2490,
-- ⚠️ PHOTOS: Replace placeholders with real flat lay product photos only.
-- NO people, NO animals, NO living beings. Products only.
  3500,
  ARRAY[
    'https://placehold.co/800x600/ede8e3/666666?text=Couvre+Matelas+%231',
    'https://placehold.co/800x600/d9d0c7/666666?text=Couvre+Matelas+%232'
  ],
  ARRAY['Blanc', 'Beige', 'Gris', 'Bleu marine'],
  ARRAY['90x190', '140x190', '160x200', '180x200'],
  47,
  TRUE
)
RETURNING id INTO v_product_1_id;

-- Product 2: Oreiller mémoire de forme
INSERT INTO products (
  id, store_id, name, slug, description, price, compare_price,
  images, colors, sizes, stock, is_active
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  'Oreiller Mémoire de Forme Cervical',
  'oreiller-memoire-de-forme-cervical',
  'Dormez mieux dès la première nuit. Notre oreiller ergonomique en mousse à mémoire de forme s''adapte parfaitement à la forme de votre cou et de votre tête. Housse amovible et lavable.',
  1890,
  2800,
  ARRAY[
    'https://placehold.co/800x600/e8e8e8/666666?text=Oreiller+%231',
    'https://placehold.co/800x600/d4d4d4/666666?text=Oreiller+%232'
  ],
  ARRAY['Blanc', 'Gris'],
  ARRAY['Standard', 'Large'],
  82,
  TRUE
)
RETURNING id INTO v_product_2_id;

-- Product 3: Parure de lit
INSERT INTO products (
  id, store_id, name, slug, description, price, compare_price,
  images, colors, sizes, stock, is_active
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  'Parure de Lit 4 Pièces Satin Luxe',
  'parure-de-lit-4-pieces-satin-luxe',
  'Transformez votre chambre en suite hôtelière. Parure complète en satin de coton: housse de couette, drap plat, 2 taies d''oreiller. Douceur exceptionnelle, couleurs vibrantes, anti-froissage.',
  3990,
  5500,
  ARRAY[
    'https://placehold.co/800x600/f5f0eb/666666?text=Parure+de+Lit+%231',
    'https://placehold.co/800x600/e8ddd3/666666?text=Parure+de+Lit+%232'
  ],
  ARRAY['Blanc cassé', 'Champagne', 'Bordeaux', 'Vert sauge', 'Bleu canard'],
  ARRAY['Simple (140x200)', 'Double (200x200)', 'King (220x240)'],
  35,
  TRUE
)
RETURNING id INTO v_product_3_id;

-- Product 4: Couverture polaire
INSERT INTO products (
  id, store_id, name, slug, description, price, compare_price,
  images, colors, sizes, stock, is_active
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  'Couverture Polaire Sherpa Ultra-Douce',
  'couverture-polaire-sherpa-ultra-douce',
  'La couverture la plus douce que vous ayez jamais touchée. Double face: polaire velours d''un côté, sherpa mouton de l''autre. Chaude sans être lourde. Parfaite pour les soirées algériennes.',
  2190,
  3200,
  ARRAY[
    'https://placehold.co/800x600/c8d4d8/666666?text=Couverture+Polaire+%231',
    'https://placehold.co/800x600/b8c8cc/666666?text=Couverture+Polaire+%232'
  ],
  ARRAY['Gris chiné', 'Camel', 'Ivoire', 'Bleu nuit', 'Rose poudré'],
  ARRAY['150x200 cm', '180x220 cm', '200x240 cm'],
  61,
  TRUE
)
RETURNING id INTO v_product_4_id;

-- ============================================================
-- STEP 5: Create Demo Landing Pages
-- ============================================================

-- Landing Page 1: Couvre-matelas
INSERT INTO landing_pages (
  id, store_id, product_id, title, slug, is_active, views, orders_count,
  content, theme_id
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  v_product_1_id,
  'Couvre-Matelas Imperméable — Protection Totale',
  'couvre-matelas-impermeable',
  TRUE,
  1247,
  38,
  '{
    "hero": {
      "headline": "Protégez votre matelas pour toujours",
      "subheadline": "La housse imperméable qui résiste à tout — eau, taches, acariens. Livraison partout en Algérie.",
      "cta_text": "Commander maintenant"
    },
    "benefits": [
      {
        "title": "100% Imperméable",
        "description": "Membrane waterproof invisible qui protège sans altérer le confort de votre matelas.",
        "icon": "shield"
      },
      {
        "title": "Anti-acariens",
        "description": "Barrière naturelle contre les acariens, idéale pour les enfants et personnes allergiques.",
        "icon": "star"
      },
      {
        "title": "Livraison rapide",
        "description": "Livraison en 24-72h partout en Algérie. Paiement à la livraison disponible.",
        "icon": "truck"
      }
    ],
    "social_proof": {
      "review_count": "+1 800 clients satisfaits",
      "rating": "4.8",
      "testimonials": [
        {
          "name": "Yasmine Boudiaf",
          "location": "Alger",
          "text": "Ma fille a renversé du jus d''orange sur le lit et le matelas était impeccable! La housse a tout absorbé. Je recommande vivement.",
          "rating": 5
        },
        {
          "name": "Mohamed Cherif",
          "location": "Oran",
          "text": "Très bonne qualité pour le prix. L''élastique tient très bien même sur mon matelas épais. Livraison en 2 jours à Oran.",
          "rating": 5
        },
        {
          "name": "Fatima Hamdani",
          "location": "Constantine",
          "text": "J''en ai commandé 3 pour toute la famille. Le tissu est doux et respirant, on ne sent pas du tout la membrane.",
          "rating": 4
        }
      ]
    },
    "product_details": {
      "sections": [
        {
          "title": "Matériaux premium",
          "content": "Fabriqué en polyester microfibre de haute qualité avec membrane TPU imperméable. Certifié OEKO-TEX, sans substances nocives. Lavable en machine à 60°C."
        },
        {
          "title": "Installation en 30 secondes",
          "content": "Élastique 360° qui s''adapte à tous les matelas de 20 à 35 cm d''épaisseur. Pas de boutons, pas de fermetures éclair — juste glisser et voilà."
        }
      ]
    },
    "urgency": {
      "type": "stock",
      "text": "Plus que quelques pièces disponibles en stock!",
      "value": 47
    },
    "order_form": {
      "title": "Commandez maintenant — Livraison rapide"
    }
  }',
  v_theme_id
)
RETURNING id INTO v_page_1_id;

-- Landing Page 2: Parure de lit
INSERT INTO landing_pages (
  id, store_id, product_id, title, slug, is_active, views, orders_count,
  content, theme_id
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  v_product_3_id,
  'Parure de Lit Satin Luxe — Chambre 5 Étoiles',
  'parure-de-lit-satin-luxe',
  TRUE,
  892,
  24,
  '{
    "hero": {
      "headline": "Dormez dans le luxe chaque soir",
      "subheadline": "Parure de lit en satin de coton — la douceur d''un hôtel 5 étoiles dans votre chambre.",
      "cta_text": "Je veux ma parure"
    },
    "benefits": [
      {
        "title": "Satin de coton pur",
        "description": "Tissu satiné d''une douceur exceptionnelle. Plus vous lavez, plus c''est doux.",
        "icon": "star"
      },
      {
        "title": "5 couleurs au choix",
        "description": "Blanc cassé, Champagne, Bordeaux, Vert sauge ou Bleu canard. Pour chaque style.",
        "icon": "shield"
      },
      {
        "title": "Garantie satisfait",
        "description": "Pas satisfait? On vous rembourse. Simple et sans condition.",
        "icon": "truck"
      }
    ],
    "social_proof": {
      "review_count": "+950 chambres transformées",
      "rating": "4.9",
      "testimonials": [
        {
          "name": "Sabrina Meziane",
          "location": "Sétif",
          "text": "Subhanallah comme c''est doux! Ma chambre ressemble maintenant à un vrai hôtel. Mon mari n''arrête pas de complimenter.",
          "rating": 5
        },
        {
          "name": "Karim Bensalem",
          "location": "Tlemcen",
          "text": "J''ai commandé le bordeaux pour chambre parentale. La couleur est exactement comme sur la photo et la qualité est au rendez-vous.",
          "rating": 5
        },
        {
          "name": "Nadia Ouali",
          "location": "Béjaïa",
          "text": "Troisième commande chez eux! Cette fois pour la chambre de ma fille. Service parfait et emballage soigné.",
          "rating": 5
        }
      ]
    },
    "product_details": {
      "sections": [
        {
          "title": "Ce que vous recevez",
          "content": "1 housse de couette avec fermeture éclair invisible + 1 drap plat grand format + 2 taies d''oreiller à revers. Tout est inclus dans un beau coffret cadeau."
        },
        {
          "title": "Entretien facile",
          "content": "Lavage en machine à 40°C. Anti-froissage — peut se ranger directement après séchage sans repassage. Conserve ses couleurs lavage après lavage."
        }
      ]
    },
    "urgency": {
      "type": "offer",
      "text": "Offre spéciale: -28% sur la parure complète. Prix d''origine 5500 DZD.",
      "value": "28"
    },
    "order_form": {
      "title": "Choisissez votre couleur et commandez"
    }
  }',
  v_theme_id
)
RETURNING id INTO v_page_2_id;

-- Landing Page 3: Oreiller
INSERT INTO landing_pages (
  id, store_id, product_id, title, slug, is_active, views, orders_count,
  content, theme_id
)
VALUES (
  gen_random_uuid(),
  v_store_id,
  v_product_2_id,
  'Oreiller Ergonomique — Fini les Douleurs au Cou',
  'oreiller-memoire-de-forme',
  TRUE,
  634,
  19,
  '{
    "hero": {
      "headline": "Réveillez-vous sans douleur dès demain",
      "subheadline": "L''oreiller ergonomique qui s''adapte à votre morphologie pour un sommeil profond et réparateur.",
      "cta_text": "Essayer maintenant"
    },
    "benefits": [
      {
        "title": "Mémoire de forme",
        "description": "S''adapte exactement à la forme de votre cou et tête. Soutien optimal toute la nuit.",
        "icon": "star"
      },
      {
        "title": "Anti-ronflement",
        "description": "Position cervicale correcte qui réduit naturellement les ronflements.",
        "icon": "shield"
      },
      {
        "title": "Housse lavable",
        "description": "Housse en bambou respirante, amovible et lavable en machine à 40°C.",
        "icon": "truck"
      }
    ],
    "social_proof": {
      "review_count": "+700 nuits améliorées",
      "rating": "4.7",
      "testimonials": [
        {
          "name": "Dr. Amira Benali",
          "location": "Annaba",
          "text": "En tant que médecin, je recommande ce type d''oreiller à mes patients souffrant de cervicalgies. Excellent rapport qualité-prix.",
          "rating": 5
        },
        {
          "name": "Rachid Khelif",
          "location": "Blida",
          "text": "J''avais des douleurs au cou depuis des mois. Après une semaine avec cet oreiller, c''est le jour et la nuit. Incroyable.",
          "rating": 5
        },
        {
          "name": "Houda Mansouri",
          "location": "Boumerdès",
          "text": "Mon mari ronfle beaucoup moins depuis qu''il utilise cet oreiller. Toute la famille dort mieux maintenant!",
          "rating": 4
        }
      ]
    },
    "product_details": {
      "sections": [
        {
          "title": "Technologie mémoire de forme",
          "content": "Mousse viscoélastique de densité 50 kg/m³ — la densité recommandée par les ergothérapeutes. Retour lent à sa forme initiale pour un soutien constant."
        },
        {
          "title": "Pour qui?",
          "content": "Idéal pour dormeurs sur le côté et sur le dos. Personnes souffrant de cervicalgies, tensions musculaires, maux de tête matinaux ou ronflements."
        }
      ]
    },
    "urgency": {
      "type": "stock",
      "text": "Stock très limité — seulement 82 unités restantes",
      "value": 82
    },
    "order_form": {
      "title": "Commandez votre oreiller — Livraison 24-72h"
    }
  }',
  v_theme_id
)
RETURNING id INTO v_page_3_id;

-- ============================================================
-- STEP 6: Create Demo Orders
-- Mix of all statuses across different Algerian wilayas
-- ============================================================

-- Order 1: Pending
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_1_id, v_page_1_id, 'Yasmine Boudiaf', '0661234567', 'Alger', 'Bab El Oued', 2, 'Blanc', '160x200', 2490, 5380, 400, 'pending', 'landing_page');

-- Order 2: Confirmed
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_3_id, v_page_2_id, 'Mohamed Cherif', '0551987654', 'Oran', 'Es Sénia', 1, 'Bordeaux', 'Double (200x200)', 3990, 4390, 400, 'confirmed', 'landing_page');

-- Order 3: Chez livreur
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_2_id, v_page_3_id, 'Rachid Khelif', '0771456789', 'Blida', 'Blida Centre', 1, 'Gris', 'Standard', 1890, 2290, 400, 'chez_livreur', 'landing_page');

-- Order 4: En livraison
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_4_id, NULL, 'Fatima Hamdani', '0662345678', 'Constantine', 'El Khroub', 1, 'Camel', '180x220 cm', 2190, 2590, 400, 'en_livraison', 'chatbot');

-- Order 5: Livrée
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_1_id, v_page_1_id, 'Sabrina Meziane', '0553567890', 'Sétif', 'Sétif Centre', 1, 'Beige', '140x190', 2490, 2890, 400, 'livree', 'landing_page');

-- Order 6: Livrée
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_3_id, v_page_2_id, 'Karim Bensalem', '0664678901', 'Tlemcen', 'Tlemcen Centre', 1, 'Vert sauge', 'Simple (140x200)', 3990, 4390, 400, 'livree', 'landing_page');

-- Order 7: Livrée (chatbot)
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_2_id, NULL, 'Nadia Ouali', '0550789012', 'Béjaïa', 'Béjaïa Centre', 2, 'Blanc', 'Large', 1890, 4180, 0, 'livree', 'chatbot');

-- Order 8: Annulée
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source, notes)
VALUES (v_store_id, v_product_4_id, NULL, 'Hamid Bouzid', '0770890123', 'Batna', 'Batna Centre', 1, 'Rose poudré', '150x200 cm', 2190, 2590, 400, 'annulee', 'landing_page', 'Client injoignable après 3 tentatives');

-- Order 9: Retournée
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source, notes)
VALUES (v_store_id, v_product_1_id, v_page_1_id, 'Amira Benkhelil', '0662901234', 'Tizi Ouzou', 'Tizi Ouzou Centre', 1, 'Gris', '180x200', 2490, 2890, 400, 'retournee', 'landing_page', 'Mauvaise taille commandée, client a refusé à la livraison');

-- Order 10: Pending (recent)
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_3_id, v_page_2_id, 'Houda Mansouri', '0558012345', 'Boumerdès', 'Bordj Menaïel', 1, 'Champagne', 'King (220x240)', 3990, 4390, 400, 'pending', 'landing_page');

-- Order 11: Confirmed
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_4_id, NULL, 'Zineb Rahmani', '0771123456', 'Annaba', 'El Bouni', 2, 'Gris chiné', '200x240 cm', 2190, 4780, 0, 'confirmed', 'chatbot');

-- Order 12: En livraison
INSERT INTO orders (store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune, quantity, color, size, unit_price, total_price, delivery_price, status, source)
VALUES (v_store_id, v_product_1_id, v_page_1_id, 'Sofiane Dahmani', '0664234567', 'Tipaza', 'Hadjout', 1, 'Bleu marine', '90x190', 2490, 2890, 400, 'en_livraison', 'landing_page');

-- ============================================================
-- STEP 7: Register as super admin
-- ============================================================
INSERT INTO super_admins (user_id)
VALUES (v_owner_id)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- STEP 8: Add chatbot daily usage for demo
-- ============================================================
INSERT INTO chatbot_daily_usage (store_id, date, message_count)
VALUES
  (v_store_id, CURRENT_DATE, 23),
  (v_store_id, CURRENT_DATE - 1, 67),
  (v_store_id, CURRENT_DATE - 2, 45),
  (v_store_id, CURRENT_DATE - 3, 89),
  (v_store_id, CURRENT_DATE - 4, 34),
  (v_store_id, CURRENT_DATE - 5, 112),
  (v_store_id, CURRENT_DATE - 6, 78);

-- ============================================================
-- CONFIRMATION
-- ============================================================
RAISE NOTICE '✅ Demo store created successfully!';
RAISE NOTICE '🏪 Store name: Maison Élégance';
RAISE NOTICE '🌐 Store URL: demo.krenix.com';
RAISE NOTICE '📦 Products created: 4';
RAISE NOTICE '📄 Landing pages created: 3';
RAISE NOTICE '📋 Orders created: 12 (across all statuses)';
RAISE NOTICE '👑 Super admin registered: %', v_owner_id;

END $$;

-- ============================================================
-- VERIFY — Run this after the DO block to confirm everything
-- ============================================================
SELECT
  s.name as store_name,
  s.slug,
  s.plan,
  s.ai_credits,
  s.chatbot_daily_limit,
  COUNT(DISTINCT p.id) as products,
  COUNT(DISTINCT lp.id) as landing_pages,
  COUNT(DISTINCT o.id) as orders
FROM stores s
LEFT JOIN products p ON p.store_id = s.id
LEFT JOIN landing_pages lp ON lp.store_id = s.id
LEFT JOIN orders o ON o.store_id = s.id
WHERE s.slug = 'demo'
GROUP BY s.id, s.name, s.slug, s.plan, s.ai_credits, s.chatbot_daily_limit;
