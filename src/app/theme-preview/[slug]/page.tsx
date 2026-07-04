import { notFound } from 'next/navigation'

// ────────────────────────────────────────────────────────────────────────────
// FULL-SCREEN THEME PREVIEW  (/theme-preview/[slug])
// ────────────────────────────────────────────────────────────────────────────
// A polished demo storefront rendered in each premium theme's aesthetic, used
// as upgrade bait in the dashboard themes gallery. Content is 100% neutral
// placeholder — NO brand names, logos, or product copy from the reference
// designs. Tokens mirror Database/014_premium_themes.sql; when real premium
// themes are swapped in later, update the THEME_DEMOS map + the migration.
// ────────────────────────────────────────────────────────────────────────────

type Demo = {
  name: string           // demo store name (fictional, neutral)
  niche: string
  colors: {
    bg: string; card: string; primary: string; secondary: string
    text: string; textMuted: string; border: string
  }
  fonts: { heading: string; body: string }
  radius: number
  hero: 'centered' | 'split' | 'fullwidth'
  // personality flags
  uppercase: boolean     // condensed all-caps headings (sport/auto)
  dark: boolean
  kicker: string
  title: string
  subtitle: string
  cta: string
  products: { name: string; price: string; tag?: string }[]
  benefits: { title: string; desc: string }[]
  testimonial: { quote: string; author: string }
}

const THEME_DEMOS: Record<string, Demo> = {
  'beauty-fashion': {
    name: 'Roséa', niche: 'Mode • Beauté • Cosmétiques',
    colors: { bg: '#FDEEEE', card: '#FFFFFF', primary: '#E85D5D', secondary: '#E8B04A', text: '#1A1A1A', textMuted: '#6B5D5A', border: 'rgba(232,93,93,0.14)' },
    fonts: { heading: 'Cormorant Garamond', body: 'Jost' }, radius: 16, hero: 'centered', uppercase: false, dark: false,
    kicker: 'Nouvelle collection', title: 'La beauté, révélée', subtitle: 'Des soins élégants, pensés pour sublimer chaque instant du quotidien.', cta: 'Découvrir',
    products: [{ name: 'Sérum Éclat', price: '3 900 DA', tag: 'Best-seller' }, { name: 'Crème Nuit', price: '4 500 DA' }, { name: 'Coffret Rituel', price: '6 900 DA', tag: 'Édition limitée' }],
    benefits: [{ title: 'Ingrédients purs', desc: 'Formules douces, testées et approuvées.' }, { title: 'Livraison 58 wilayas', desc: 'Partout en Algérie, sous 48h.' }, { title: 'Paiement à la livraison', desc: 'Commandez en toute confiance.' }],
    testimonial: { quote: 'Ma peau n’a jamais été aussi lumineuse. Une vraie révélation.', author: 'Lina, Alger' },
  },
  'tech-mobile': {
    name: 'Voltiq', niche: 'Téléphonie • Accessoires • Gadgets',
    colors: { bg: '#FFFFFF', card: '#F5F5F5', primary: '#8BC34A', secondary: '#F5A623', text: '#1A1A1A', textMuted: '#6B7280', border: 'rgba(0,0,0,0.08)' },
    fonts: { heading: 'Poppins', body: 'Poppins' }, radius: 14, hero: 'split', uppercase: false, dark: false,
    kicker: 'Smart. Rapide. Moderne.', title: 'La tech qui suit le rythme', subtitle: 'Des accessoires intelligents pour un quotidien connecté, sans compromis.', cta: 'Explorer',
    products: [{ name: 'Écouteurs Pro', price: '5 500 DA', tag: 'Populaire' }, { name: 'Chargeur 65W', price: '2 900 DA' }, { name: 'Montre Active', price: '8 900 DA', tag: 'Nouveau' }],
    benefits: [{ title: 'Garantie 12 mois', desc: 'Produits testés et fiables.' }, { title: 'Expédition rapide', desc: 'Suivi en temps réel.' }, { title: 'Support réactif', desc: 'Une équipe à votre écoute.' }],
    testimonial: { quote: 'Qualité au top et livraison ultra rapide. Je recommande.', author: 'Yacine, Oran' },
  },
  'fitness-wellness': {
    name: 'Kinetic', niche: 'Sport • Musculation • Bien-être',
    colors: { bg: '#141414', card: '#1C1C1C', primary: '#DFFF3A', secondary: '#C9D048', text: '#FFFFFF', textMuted: '#8F8F8F', border: 'rgba(223,255,58,0.18)' },
    fonts: { heading: 'Barlow Condensed', body: 'Barlow' }, radius: 6, hero: 'fullwidth', uppercase: true, dark: true,
    kicker: 'Dépasse tes limites', title: 'PLUS FORT. CHAQUE JOUR.', subtitle: 'L’équipement qui transforme l’effort en résultats. Sans excuses.', cta: 'Je commence',
    products: [{ name: 'Pack Résistance', price: '4 200 DA', tag: 'Top vente' }, { name: 'Shaker Pro', price: '1 500 DA' }, { name: 'Ceinture Force', price: '3 800 DA', tag: 'Nouveau' }],
    benefits: [{ title: 'Qualité pro', desc: 'Matériel conçu pour durer.' }, { title: 'Résultats prouvés', desc: 'Adopté par des milliers de sportifs.' }, { title: 'Livraison partout', desc: '58 wilayas, paiement à la livraison.' }],
    testimonial: { quote: 'Enfin du matériel sérieux. Mes séances sont passées à un autre niveau.', author: 'Sofiane, Constantine' },
  },
  'auto-accessories': {
    name: 'Axel', niche: 'Pièces auto • Tuning • Entretien',
    colors: { bg: '#F4F4F4', card: '#FFFFFF', primary: '#E62E2D', secondary: '#111111', text: '#111111', textMuted: '#6B6B6B', border: 'rgba(0,0,0,0.09)' },
    fonts: { heading: 'Barlow Condensed', body: 'Barlow' }, radius: 4, hero: 'fullwidth', uppercase: true, dark: false,
    kicker: 'Performance & Style', title: 'ÉQUIPE TA MACHINE', subtitle: 'Des accessoires auto pensés pour la route algérienne. Fiables, robustes, prêts.', cta: 'Voir le catalogue',
    products: [{ name: 'Tapis Premium', price: '3 500 DA', tag: 'Best-seller' }, { name: 'Kit LED', price: '2 200 DA' }, { name: 'Housse Sport', price: '5 900 DA', tag: 'Promo' }],
    benefits: [{ title: 'Robuste', desc: 'Testé pour durer sur toutes les routes.' }, { title: 'Compatible', desc: 'S’adapte à la plupart des véhicules.' }, { title: 'Paiement livraison', desc: 'Vérifiez avant de payer.' }],
    testimonial: { quote: 'Qualité impeccable, montage facile. Ma voiture a une autre allure.', author: 'Karim, Blida' },
  },
  'home-lifestyle': {
    name: 'Maïa', niche: 'Maison • Déco • Art de vivre',
    colors: { bg: '#F5F5F2', card: '#FFFFFF', primary: '#FF5B2E', secondary: '#1F8A5B', text: '#1A1A1A', textMuted: '#6B6B6B', border: 'rgba(0,0,0,0.07)' },
    fonts: { heading: 'Sora', body: 'Manrope' }, radius: 18, hero: 'centered', uppercase: false, dark: false,
    kicker: 'Vivre avec style', title: 'Un intérieur qui vous ressemble', subtitle: 'Des objets chaleureux et durables pour transformer chaque pièce en cocon.', cta: 'Découvrir',
    products: [{ name: 'Lampe Douce', price: '4 800 DA', tag: 'Coup de cœur' }, { name: 'Plaid Coton', price: '3 200 DA' }, { name: 'Set Cuisine', price: '5 400 DA', tag: 'Nouveau' }],
    benefits: [{ title: 'Matières nobles', desc: 'Sélection soignée, durable et saine.' }, { title: 'Livraison soignée', desc: 'Emballage protégé, 58 wilayas.' }, { title: 'Satisfait ou aidé', desc: 'Un service attentionné.' }],
    testimonial: { quote: 'Chaque pièce respire la qualité. Mon salon a complètement changé.', author: 'Nawel, Sétif' },
  },
}

// hex + alpha helper (accepts #rrggbb, returns rgba)
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export function generateStaticParams() {
  return Object.keys(THEME_DEMOS).map(slug => ({ slug }))
}

export default async function ThemePreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const d = THEME_DEMOS[slug]
  if (!d) notFound()

  const c = d.colors
  const H: React.CSSProperties = { fontFamily: `'${d.fonts.heading}', serif`, ...(d.uppercase ? { textTransform: 'uppercase', letterSpacing: '0.01em' } : {}) }
  const B: React.CSSProperties = { fontFamily: `'${d.fonts.body}', sans-serif` }

  const fontUrl =
    `https://fonts.googleapis.com/css2?family=${d.fonts.heading.replace(/ /g, '+')}:wght@400;500;600;700;800;900` +
    (d.fonts.body !== d.fonts.heading ? `&family=${d.fonts.body.replace(/ /g, '+')}:wght@400;500;600;700` : '') +
    `&display=swap`

  // Placeholder product visual: soft gradient tile in theme colors (no real imagery)
  const tile = (i: number): React.CSSProperties => ({
    height: 180,
    background: `linear-gradient(135deg, ${alpha(c.primary, i % 2 ? 0.22 : 0.14)}, ${alpha(c.secondary, 0.14)})`,
    borderBottom: `1px solid ${c.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  return (
    <div style={{ background: c.bg, color: c.text, minHeight: '100vh', ...B }}>
      <link rel="stylesheet" href={fontUrl} />

      {/* Demo banner (makes clear this is a preview, not a live store) */}
      <div style={{ background: c.primary, color: d.dark ? '#111' : '#fff', textAlign: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 700, ...B }}>
        Aperçu du thème — contenu de démonstration
      </div>

      {/* Announcement */}
      <div style={{ background: c.card, borderBottom: `1px solid ${c.border}`, textAlign: 'center', padding: '9px 16px', fontSize: 12.5, color: c.textMuted, ...B }}>
        Livraison 58 wilayas · Paiement à la livraison · Support 7j/7
      </div>

      {/* Header */}
      <header style={{ background: c.bg, borderBottom: `1px solid ${c.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: d.radius / 2, background: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.dark ? '#111' : '#fff', fontWeight: 800, ...H }}>
              {d.name[0]}
            </div>
            <span style={{ fontWeight: 700, fontSize: 22, ...H }}>{d.name}</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 14, color: c.textMuted }}>
            <span className="nav-hide">Boutique</span>
            <span className="nav-hide">Nouveautés</span>
            <span className="nav-hide">Contact</span>
            <a style={{ background: c.primary, color: d.dark ? '#111' : '#fff', padding: '9px 18px', borderRadius: d.radius, fontWeight: 700, fontSize: 13.5, ...B }}>{d.cta}</a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      {d.hero === 'split' ? (
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px', display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 48, alignItems: 'center' }} className="hero-grid">
          <div>
            <span style={{ color: c.primary, fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{d.kicker}</span>
            <h1 style={{ fontSize: 54, lineHeight: 1.05, fontWeight: 800, margin: '16px 0 18px', ...H }}>{d.title}</h1>
            <p style={{ fontSize: 18, color: c.textMuted, maxWidth: 460, marginBottom: 28, lineHeight: 1.6 }}>{d.subtitle}</p>
            <div style={{ display: 'flex', gap: 14 }}>
              <a style={{ background: c.primary, color: d.dark ? '#111' : '#fff', padding: '15px 30px', borderRadius: d.radius, fontWeight: 700, fontSize: 15.5 }}>{d.cta}</a>
              <a style={{ background: 'transparent', color: c.text, padding: '15px 26px', borderRadius: d.radius, fontWeight: 600, fontSize: 15.5, border: `1px solid ${c.border}` }}>En savoir plus</a>
            </div>
          </div>
          <div style={{ borderRadius: d.radius * 1.6, background: `linear-gradient(135deg, ${alpha(c.primary, 0.18)}, ${alpha(c.secondary, 0.12)})`, border: `1px solid ${c.border}`, height: 380 }} />
        </section>
      ) : d.hero === 'fullwidth' ? (
        <section style={{ background: d.dark ? c.card : c.secondary === '#111111' ? '#111111' : c.card, color: d.dark || c.secondary === '#111111' ? '#fff' : c.text, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '92px 24px', textAlign: 'center' }}>
            <span style={{ color: c.primary, fontWeight: 800, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{d.kicker}</span>
            <h1 style={{ fontSize: 76, lineHeight: 0.98, fontWeight: 900, margin: '18px auto 20px', maxWidth: 820, ...H }}>{d.title}</h1>
            <p style={{ fontSize: 19, maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.6, color: (d.dark || c.secondary === '#111111') ? 'rgba(255,255,255,0.72)' : c.textMuted }}>{d.subtitle}</p>
            <a style={{ display: 'inline-block', background: c.primary, color: '#111', padding: '17px 40px', borderRadius: d.radius, fontWeight: 800, fontSize: 16, letterSpacing: d.uppercase ? '0.04em' : undefined, textTransform: d.uppercase ? 'uppercase' : undefined, ...B }}>{d.cta}</a>
          </div>
        </section>
      ) : (
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '84px 24px 68px', textAlign: 'center' }}>
          <span style={{ color: c.primary, fontWeight: 600, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{d.kicker}</span>
          <h1 style={{ fontSize: 62, lineHeight: 1.06, fontWeight: 600, margin: '18px 0 20px', ...H }}>{d.title}</h1>
          <p style={{ fontSize: 19, color: c.textMuted, maxWidth: 520, margin: '0 auto 30px', lineHeight: 1.65 }}>{d.subtitle}</p>
          <a style={{ display: 'inline-block', background: c.primary, color: d.dark ? '#111' : '#fff', padding: '15px 36px', borderRadius: d.radius, fontWeight: 700, fontSize: 15.5 }}>{d.cta}</a>
        </section>
      )}

      {/* TRUST BAR */}
      <div style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, background: c.card }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px 40px', fontSize: 13.5, color: c.textMuted, fontWeight: 600 }}>
          <span>✓ Produits vérifiés</span><span>✓ Livraison 58 wilayas</span><span>✓ Paiement à la livraison</span><span>✓ Support 7j/7</span>
        </div>
      </div>

      {/* PRODUCTS */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 38, fontWeight: d.uppercase ? 800 : 700, margin: '0 0 10px', ...H }}>Nos produits</h2>
          <p style={{ color: c.textMuted, fontSize: 16 }}>Une sélection pensée pour {d.niche.split('•')[0].trim().toLowerCase()}.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }} className="prod-grid">
          {d.products.map((p, i) => (
            <div key={i} style={{ background: c.card, borderRadius: d.radius, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
              <div style={tile(i)}>
                {p.tag && (
                  <span style={{ position: 'absolute', margin: 14, alignSelf: 'flex-start', justifySelf: 'flex-start', background: c.primary, color: d.dark ? '#111' : '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: d.radius / 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.tag}</span>
                )}
              </div>
              <div style={{ padding: '18px 18px 20px' }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', ...H }}>{p.name}</h3>
                <p style={{ color: c.textMuted, fontSize: 13.5, margin: '0 0 14px' }}>Qualité premium, satisfaction garantie.</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: c.primary, ...H }}>{p.price}</span>
                  <a style={{ background: c.primary, color: d.dark ? '#111' : '#fff', padding: '9px 16px', borderRadius: d.radius, fontWeight: 700, fontSize: 13, ...B }}>Commander</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BENEFITS */}
      <section style={{ background: c.card, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '58px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }} className="prod-grid">
          {d.benefits.map((b, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: d.radius, background: alpha(c.primary, 0.14), border: `1px solid ${c.border}`, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.primary, fontWeight: 800, fontSize: 22, ...H }}>{i + 1}</div>
              <h4 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', ...H }}>{b.title}</h4>
              <p style={{ color: c.textMuted, fontSize: 14.5, lineHeight: 1.55, maxWidth: 260, margin: '0 auto' }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px', textAlign: 'center' }}>
        <div style={{ color: c.primary, fontSize: 40, lineHeight: 1, marginBottom: 12, ...H }}>“</div>
        <p style={{ fontSize: 26, fontWeight: d.uppercase ? 700 : 500, lineHeight: 1.5, margin: '0 0 18px', ...H }}>{d.testimonial.quote}</p>
        <p style={{ color: c.textMuted, fontSize: 14.5, fontWeight: 600 }}>— {d.testimonial.author}</p>
      </section>

      {/* CTA BAND */}
      <section style={{ background: c.primary, color: d.dark ? '#111' : '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 12px', ...H }}>Prêt à commander ?</h2>
          <p style={{ fontSize: 17, opacity: 0.9, margin: '0 0 26px' }}>Livraison partout en Algérie, paiement à la réception.</p>
          <a style={{ display: 'inline-block', background: d.dark ? '#111' : '#fff', color: d.dark ? '#fff' : c.primary, padding: '15px 38px', borderRadius: d.radius, fontWeight: 800, fontSize: 15.5, ...B }}>{d.cta}</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: c.bg, borderTop: `1px solid ${c.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 20, ...H }}>{d.name}</span>
          <span style={{ color: c.textMuted, fontSize: 13 }}>Propulsé par Novalux · Thème de démonstration</span>
        </div>
      </footer>

      <style>{`
        @media (max-width: 760px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .prod-grid { grid-template-columns: 1fr !important; }
          .nav-hide { display: none !important; }
        }
      `}</style>
    </div>
  )
}
