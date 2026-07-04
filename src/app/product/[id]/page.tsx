"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import { OrderForm } from "@/components/OrderForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
export default function ProductPage() {
  const params = useParams();
  const id = params.id as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string>("");
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>("");

  useEffect(() => {
    if (!id || id === "undefined" || id === "null") return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", id)
          .single();
        
        if (data && !error) {
          const prod = data as Product;
          setProduct(prod);
          const firstVariant = prod.variants?.[0];
          setActiveImage(firstVariant?.image_urls?.[0] || firstVariant?.image_url || prod.image_url);
          if (firstVariant?.color) {
            setSelectedColor(firstVariant.color);
          }
        } else {
          // Check fallback data for demo if not found in DB
          const fallbackProduct = DEMO_PRODUCTS.find(p => p.id === id);
          if (fallbackProduct) {
            setProduct(fallbackProduct);
            const firstVariant = fallbackProduct.variants?.[0];
            setActiveImage(firstVariant?.image_urls?.[0] || firstVariant?.image_url || fallbackProduct.image_url);
            if (firstVariant?.color) {
              setSelectedColor(firstVariant.color);
            }
          } else {
            console.error("Product not found");
          }
        }
      } catch (err) {
        console.error("Failed to load product", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f6f0]">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f6f0]">
        <h1 className="text-2xl font-bold mb-4">Produit introuvable</h1>
        <Link href="/" className="btn-gold">Retour à l'accueil</Link>
      </div>
    );
  }

  // Find the currently selected variant
  const activeVariant = product.variants?.find(v => v.color === selectedColor);
  
  // Get variant images (multiple image_urls or single image_url fallback)
  const variantImages = activeVariant 
    ? (activeVariant.image_urls && activeVariant.image_urls.length > 0 
        ? activeVariant.image_urls 
        : (activeVariant.image_url ? [activeVariant.image_url] : []))
    : [];

  // Start the gallery with the selected variant's photos
  const allImages = [...variantImages];

  // Combine with general product images if they aren't already included
  if (product.image_url && !allImages.includes(product.image_url)) {
    allImages.push(product.image_url);
  }
  if (product.hover_image_url && !allImages.includes(product.hover_image_url)) {
    allImages.push(product.hover_image_url);
  }

  // Add other variant images at the end of the list so they are still browseable
  if (product.variants) {
    product.variants.forEach(v => {
      if (v.color !== selectedColor) {
        const vImgs = v.image_urls && v.image_urls.length > 0 ? v.image_urls : (v.image_url ? [v.image_url] : []);
        vImgs.forEach(img => {
          if (img && !allImages.includes(img)) {
            allImages.push(img);
          }
        });
      }
    });
  }

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    if (product.variants) {
      const variant = product.variants.find(v => v.color === color);
      if (variant) {
        const primaryImg = variant.image_urls?.[0] || variant.image_url;
        if (primaryImg) {
          setActiveImage(primaryImg);
        }
      }
    }
  };
  return (
    <main className="min-h-screen bg-[#f9f6f0] pb-24">
      {/* ── Navbar ── */}
      <header className="bg-white border-b border-[#ede9e0] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-[#0f2847] transition-colors font-medium text-sm">
            <ArrowLeft size={18} />
            <span className="hidden xs:inline">Retour au catalogue</span>
            <span className="xs:hidden">Retour</span>
          </Link>
          <div className="ml-auto font-heading font-bold text-lg md:text-xl text-[#d4af37] uppercase tracking-widest">
            Le Mirage
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 mt-6 md:mt-12 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 xl:gap-16">
          
          {/* ── Left Column: Images & Description ── */}
          <div className="lg:col-span-7 space-y-5 md:space-y-8">
            {/* Image Gallery */}
            <div className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-4 shadow-sm border border-[#ede9e0]">
              <motion.div 
                key={activeImage}
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 1 }}
                className="relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden bg-gray-100 cursor-pointer group"
                onClick={() => setIsLightboxOpen(true)}
              >
                <img 
                  src={activeImage || undefined} 
                  alt={product.name} 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                />
              </motion.div>
              
              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 md:gap-4 mt-3 md:mt-4 overflow-x-auto pb-2">
                  {allImages.map((img, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setActiveImage(img)}
                      className={`w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-lg md:rounded-xl overflow-hidden border-2 transition-all ${
                        activeImage === img ? 'border-[#d4af37] opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img || undefined} alt={`Vue ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Long Description Area */}
            <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-10 shadow-sm border border-[#ede9e0]">
              <h2 className="font-heading text-xl md:text-2xl font-bold text-[#0f2847] mb-4 md:mb-6">Description détaillée</h2>
              <div className="prose prose-stone max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap text-sm md:text-base">
                {product.description}
              </div>
            </div>
          </div>

          {/* ── Right Column: Form ── */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-20">
              <OrderForm product={product} onColorSelect={handleColorSelect} />
            </div>
          </div>

        </div>
      </div>

      {/* Lightbox */}
      {isLightboxOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button 
            className="absolute top-6 right-6 text-white/70 hover:text-white"
            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <img 
            src={activeImage || undefined} 
            alt={product.name} 
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
