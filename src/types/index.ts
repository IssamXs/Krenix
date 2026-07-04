export interface ProductVariant {
  color: string;
  quantity: number;
  image_url: string;
  image_urls?: string[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  hover_image_url?: string;
  colors: string[];
  stock_quantity: number;
  category: string;
  created_at: string;
  variants?: ProductVariant[];
}

export interface Order {
  id: string;
  customer_nom: string;
  customer_prenom: string;
  customer_phone: string;
  customer_wilaya: string;
  customer_commune: string;
  product_id: string;
  product_name: string;
  selected_color: string;
  quantity: number;
  total_price: number;
  delivery_fee: number;
  status: 'pending' | 'confirmed' | 'société_livraison' | 'on_the_way' | 'delivered' | 'cancelled' | 'returned';
  created_at: string;
}
