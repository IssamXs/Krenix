import { Product } from "@/types";

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "1",
    name: "Cache Rideau Velours Royal",
    description: "Velours épais et soyeux, tenue parfaite. Idéal pour salon ou chambre.",
    price: 3200,
    image_url:
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?q=80&w=800&auto=format&fit=crop",
    hover_image_url:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop",
    colors: ["Emeraude", "Bordeaux", "Crème", "Gris Perle"],
    stock_quantity: 24,
    category: "Cache Rideaux",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Couvre Salon Premium",
    description: "Housse de salon élégante, résistante aux taches. Disponible en plusieurs tailles.",
    price: 5800,
    image_url:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop",
    hover_image_url:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?q=80&w=800&auto=format&fit=crop",
    colors: ["Beige Sable", "Chocolat", "Anthracite"],
    stock_quantity: 3,
    category: "Couvre Salon",
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    name: "Couvre Matelas Molletonné",
    description: "Protection matelas ultra-douce, respirante et imperméable. Taille standard.",
    price: 2100,
    image_url:
      "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=800&auto=format&fit=crop",
    hover_image_url:
      "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?q=80&w=800&auto=format&fit=crop",
    colors: ["Blanc Neige", "Ivoire"],
    stock_quantity: 0,
    category: "Couvre Matelas",
    created_at: new Date().toISOString(),
  },
  {
    id: "4",
    name: "Couvre Coussin Brodé",
    description: "Housses de coussin avec broderies arabesques. Lot de 4 pièces assorties.",
    price: 1400,
    image_url:
      "https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?q=80&w=800&auto=format&fit=crop",
    hover_image_url:
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?q=80&w=800&auto=format&fit=crop",
    colors: ["Doré", "Turquoise", "Corail", "Prune"],
    stock_quantity: 18,
    category: "Couvre Coussin",
    created_at: new Date().toISOString(),
  },
  {
    id: "5",
    name: "Cache Rideau Lin Naturel",
    description: "Lin 100 % naturel, texture artisanale. Un look épuré et contemporain.",
    price: 2700,
    image_url:
      "https://images.unsplash.com/photo-1484101403633-562f891dc89a?q=80&w=800&auto=format&fit=crop",
    hover_image_url:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=800&auto=format&fit=crop",
    colors: ["Lin Naturel", "Blanc Cassé", "Taupe"],
    stock_quantity: 9,
    category: "Cache Rideaux",
    created_at: new Date().toISOString(),
  },
  {
    id: "6",
    name: "Couvre Salon Matelassé",
    description: "Matelassage luxueux 3D, lavable en machine. Protège et embellit.",
    price: 6500,
    image_url:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?q=80&w=800&auto=format&fit=crop",
    hover_image_url:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop",
    colors: ["Gris Ciment", "Bleu Nuit", "Terracotta"],
    stock_quantity: 6,
    category: "Couvre Salon",
    created_at: new Date().toISOString(),
  },
];
