-- ─── 1. Products table ──────────────────────────────────────────────────────
create table if not exists products (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  description      text,
  price            integer     not null,          -- Prix en DZD
  image_url        text        default '',
  hover_image_url  text        default '',         -- Image affichée au hover
  colors           text[]      default '{}',       -- ex: '{"Emeraude","Bordeaux"}'
  stock_quantity   integer     not null default 0,
  category         text        default '',
  created_at       timestamptz default now()
);

-- ─── 2. Orders table ────────────────────────────────────────────────────────
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid references products(id) on delete set null,
  product_name     text,
  customer_nom     text not null,
  customer_prenom  text not null,
  customer_phone   text not null,
  customer_wilaya  text not null,
  customer_commune text not null,
  selected_color   text,
  quantity         integer     not null default 1,
  delivery_fee     integer     not null default 0, -- Frais WECAN selon wilaya
  total_price      integer     not null default 0, -- Produit + livraison
  status           text        not null default 'pending'
                   check (status in ('pending','processing','delivered','cancelled')),
  created_at       timestamptz default now()
);

-- ─── 3. Row Level Security (RLS) ────────────────────────────────────────────
alter table products enable row level security;
alter table orders   enable row level security;

-- Public can read products
create policy "public_read_products"
  on products for select using (true);

-- Public can insert orders (customer checkout)
create policy "public_insert_orders"
  on orders for insert with check (true);

-- Authenticated users (admin) can do everything
create policy "admin_all_products"
  on products for all using (auth.role() = 'authenticated');

create policy "admin_all_orders"
  on orders for all using (auth.role() = 'authenticated');

-- ─── 4. Storage bucket for product images ───────────────────────────────────
-- Dashboard > Storage > New bucket
-- Name: product-images  |  Public: ON
-- insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
