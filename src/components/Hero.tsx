"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

export interface HeroOverlay {
  id: string;
  text: string;
  x: number;   // % from left
  y: number;   // % from top
  fontSize: number; // px
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
}

interface Props {
  backgroundImage: string;
  overlays?: HeroOverlay[];
}

// ── Interactive 3D Parallax Hero ──────────────────────────────────────────────
// Tracks mouse (desktop) and touch (mobile) to create a realistic fabric
// movement effect with perspective tilt, translation, and a subtle shine.

export function Hero({ backgroundImage, overlays = [] }: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number>(0);

  // Current smooth values (lerped)
  const current = useRef({ x: 0, y: 0 });
  // Target values (raw mouse/touch position mapped to -1…1)
  const target = useRef({ x: 0, y: 0 });
  // Whether the pointer is inside the hero
  const isActive = useRef(false);

  // Shine overlay position
  const [shine, setShine] = useState({ x: 50, y: 50 });

  // ── Map pointer position to -1…1 range relative to container center ──
  const mapPointer = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Normalise to -1 … 1
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
    target.current = { x: nx, y: ny };
    isActive.current = true;

    // Update shine position (percentage)
    setShine({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  // ── Mouse handlers ──
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mapPointer(e.clientX, e.clientY);
  }, [mapPointer]);

  const onMouseLeave = useCallback(() => {
    isActive.current = false;
    target.current = { x: 0, y: 0 };
  }, []);

  // ── Touch handlers ──
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) mapPointer(touch.clientX, touch.clientY);
  }, [mapPointer]);

  const onTouchEnd = useCallback(() => {
    isActive.current = false;
    target.current = { x: 0, y: 0 };
  }, []);

  // ── Animation loop: smooth lerp towards target ──
  useEffect(() => {
    const LERP = 0.07; // Smoothing factor (lower = slower/smoother)

    const animate = () => {
      const cur = current.current;
      const tgt = target.current;

      // Lerp current towards target
      cur.x += (tgt.x - cur.x) * LERP;
      cur.y += (tgt.y - cur.y) * LERP;

      const img = imgRef.current;
      if (img) {
        // ── Transform values ──
        // Translation: move image opposite to mouse for parallax depth
        const translateX = cur.x * -18;  // px
        const translateY = cur.y * -12;  // px
        // 3D tilt: rotate around axes for depth feel
        const rotateY = cur.x * 3;       // degrees – tilt left/right
        const rotateX = cur.y * -2;      // degrees – tilt up/down
        // Very subtle scale breathing
        const scale = 1.06 + Math.abs(cur.x * cur.y) * 0.02;

        img.style.transform =
          `perspective(1200px) ` +
          `translate3d(${translateX}px, ${translateY}px, 0) ` +
          `rotateX(${rotateX}deg) rotateY(${rotateY}deg) ` +
          `scale(${scale})`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative w-full bg-[#061121] overflow-hidden flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative w-full max-w-full overflow-hidden">
        {/* The interactive image */}
        <img
          ref={imgRef}
          src={backgroundImage}
          alt="Hero background"
          className="w-full h-auto block object-contain origin-center will-change-transform"
          style={{
            maxHeight: '100svh',
            transform: 'perspective(1200px) translate3d(0,0,0) scale(1.06)',
            transition: 'none',
          }}
          draggable={false}
        />

        {/* Dynamic shine / light reflection overlay */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            background: `radial-gradient(ellipse 35% 45% at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.08) 0%, transparent 70%)`,
            opacity: isActive.current ? 1 : 0,
          }}
        />

        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />

        {/* Edge shadow to hide any exposed edges during translation */}
        <div className="absolute inset-0 pointer-events-none" style={{
          boxShadow: 'inset 0 0 60px 30px #061121',
        }} />

        {/* ── Free-placed text overlays ── */}
        {overlays.map((ov) => (
          <div
            key={ov.id}
            className="absolute z-10 pointer-events-none select-none"
            style={{
              left: `${ov.x}%`,
              top: `${ov.y}%`,
              transform: "translate(-50%, -50%)",
              fontSize: `calc(${ov.fontSize / 12}vw)`,
              color: ov.color,
              fontWeight: ov.bold ? 700 : 400,
              textAlign: ov.align,
              whiteSpace: "pre-wrap",
              width: "100%",
              maxWidth: "100%",
              lineHeight: 1.2,
              textShadow: "0 2px 12px rgba(0,0,0,0.7)",
            }}
          >
            {ov.text}
          </div>
        ))}
      </div>

      {/* ── Scroll cue ── */}
      <motion.a
        href="#catalogue"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
      >
        <span className="text-[10px] md:text-xs tracking-widest uppercase hidden sm:block">Défiler</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          <ChevronDown size={22} />
        </motion.div>
      </motion.a>
    </section>
  );
}
