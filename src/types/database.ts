// ============================================================
// NOVALUX — Database TypeScript Types
// These must match the Supabase schema exactly
// ============================================================

export type Plan = 'basic' | 'pro' | 'ultimate' | 'growth' | 'business' | 'agency' | 'enterprise' | 'sur_mesure'

// Plan helpers — matches CLAUDE.md hierarchy
export const PRO_PLANS: Plan[] = ['pro', 'ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure']
export const ULTIMATE_PLANS: Plan[] = ['ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure']
export const GROWTH_PLANS: Plan[] = ['growth', 'business', 'agency', 'enterprise', 'sur_mesure']
export const BUSINESS_PLANS: Plan[] = ['business', 'agency', 'enterprise', 'sur_mesure']
export const AGENCY_PLANS: Plan[] = ['agency', 'enterprise', 'sur_mesure']
export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'expired' | 'suspended'
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'chez_livreur'
  | 'en_livraison'
  | 'livree'
  | 'annulee'
  | 'retournee'
export type OrderSource = 'manual' | 'chatbot' | 'form' | 'landing_page' | 'messenger' | 'instagram'
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  manual: 'Manuel',
  chatbot: 'Chatbot',
  form: 'Formulaire',
  landing_page: 'Landing page',
  messenger: 'Messenger',
  instagram: 'Instagram',
}
export type PaymentMethod = 'cib' | 'edahabia' | 'baridimob' | 'virement' | 'cash' | 'other'
export type SubscriptionPaymentStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'rejected'
export type TierRequired = 'basic' | 'pro' | 'ultimate'

// ============================================================
// THEME
// ============================================================
export interface ThemeColors {
  background: string
  card: string
  primary: string
  secondary: string
  text: string
  textMuted: string
  border: string
}

export interface ThemeConfig {
  colors: ThemeColors
  fonts: {
    heading: string
    body: string
  }
  borderRadius: string
  heroLayout: 'centered' | 'split' | 'fullwidth'
  cardStyle: 'glassmorphic' | 'minimal' | 'warm' | 'bold' | 'luxury' | 'clean' | 'vibrant'
}

export interface Theme {
  id: string
  name: string
  slug: string
  preview_url: string | null
  tier_required: TierRequired
  config: ThemeConfig
  is_active: boolean
  created_at: string
}

// ============================================================
// STORE SETTINGS
// ============================================================
export interface StoreSettings {
  primaryColor: string
  secondaryColor: string
  fontFamily: string
  borderRadius: string
  whatsapp: string
  facebook: string
  instagram: string
  tiktok?: string
  snapchat?: string
  youtube?: string
  bio?: string
  email?: string
  address?: string
  bannerUrl?: string
  deliveryPrice: number
  freeDeliveryThreshold: number
  welcomeMessage: string
  // Per-wilaya delivery rates. Key = wilaya name, 'default' = fallback for all wilayas
  deliveryRates?: { default: number; [wilaya: string]: number }
  // Financial settings for margin calculator
  financialSettings?: {
    returnFee: number
    purchasePrices: Record<string, number>
    adsBudgets: Record<string, number>
    globalAdsBudget: number
  }
  // Google Tag Manager container id (GTM-XXXXXXX). Ultimate+; injected into the storefront.
  gtmId?: string
  // Google Sheets sync webhook (Apps Script / Zapier). New orders are POSTed here.
  sheetsWebhookUrl?: string
  // Merchant-configurable chatbot behaviour (Ultimate). Absent = defaults.
  chatbot?: ChatbotSettings
  // Merchant-editable WhatsApp order status messages. Absent = defaults.
  orderMessages?: OrderMessagesSettings
  // Merchant-editable storefront copy for the main theme slots. Themes read
  // these; any absent field falls back to that theme's default copy.
  storeContent?: StoreContentSettings
}

// Editable "main" storefront text surfaced in dashboard settings. Kept small on
// purpose (hero + one promo line + footer tagline), not full page control.
export interface StoreContentSettings {
  heroHeadline?: string
  heroSubtitle?: string
  heroCta?: string
  promoTitle?: string
  footerTagline?: string
}

// WhatsApp status-update message templates (keyed by order status).
// Placeholders: {name} {order_number} {product} {total} {wilaya} {commune} {store}
export interface OrderMessagesSettings {
  confirmed?: string
  chez_livreur?: string
  en_livraison?: string
  livree?: string
  annulee?: string
}

export type ChatbotTone = 'chaleureux' | 'professionnel' | 'direct' | 'amical'

export interface ChatbotSettings {
  enabled?: boolean          // merchant on/off switch; undefined = on
  greeting?: string          // first message shown in the widget
  tone?: ChatbotTone         // personality preset
  instructions?: string      // optional extra guidance for the bot
}

// ============================================================
// STORE
// ============================================================
export interface Store {
  id: string
  owner_id: string
  name: string
  slug: string
  logo_url: string | null
  theme_id: string | null
  plan: Plan
  subscription_status: SubscriptionStatus
  ai_credits: number
  chatbot_daily_limit: number
  settings: StoreSettings
  is_onboarded: boolean
  is_suspended: boolean
  // Custom domain (Growth+). Served by the middleware once DNS is verified.
  custom_domain: string | null
  custom_domain_verified: boolean
  created_at: string
  updated_at: string
  // Joined fields
  theme?: Theme
}

// ============================================================
// PRODUCT
// ============================================================
export interface Product {
  id: string
  store_id: string
  name: string
  slug: string
  description: string | null
  price: number
  compare_price: number | null
  images: string[]
  colors: string[]
  sizes: string[]
  stock: number
  is_active: boolean
  meta_title: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// LANDING PAGE CONTENT
// ============================================================
export interface LandingPageHero {
  headline: string
  subheadline: string
  cta_text: string
  background_image?: string
}

export interface LandingPageBenefit {
  title: string
  description: string
  icon: string
}

export interface LandingPageTestimonial {
  name: string
  location: string
  text: string
  rating: number
}

export interface LandingPageSocialProof {
  review_count: string
  rating: string
  testimonials: LandingPageTestimonial[]
}

export interface LandingPageDetailSection {
  title: string
  content: string
}

export interface LandingPageUrgency {
  type: 'stock' | 'timer' | 'offer'
  text: string
  value?: string | number
}

export interface LandingPageMeta {
  productName?: string
  price?: number
  lang?: 'fr' | 'ar' | 'both'
  imageUrl?: string
}

export type LandingPageCoreContent = {
  hero: LandingPageHero
  benefits: LandingPageBenefit[]
  social_proof: LandingPageSocialProof
  product_details: { sections: LandingPageDetailSection[] }
  urgency: LandingPageUrgency
  order_form: { title: string }
}

export interface LandingPageContent extends LandingPageCoreContent {
  _ar?: LandingPageCoreContent
  _meta?: LandingPageMeta
}

// ============================================================
// LANDING PAGE
// ============================================================
export interface LandingPage {
  id: string
  store_id: string
  product_id: string | null
  title: string
  slug: string
  content: LandingPageContent
  theme_id: string | null
  is_active: boolean
  views: number
  orders_count: number
  generated_images: string[]
  // Inventory for this landing page. null = stock not tracked (legacy pages).
  stock: number | null
  // Upsell
  upsell_enabled: boolean
  upsell_product_name: string | null
  upsell_text: string | null
  upsell_price: number | null
  created_at: string
  updated_at: string
  // Joined fields
  product?: Product
  theme?: Theme
}

// ============================================================
// LEAD
// ============================================================
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost'

export interface Lead {
  id: string
  store_id: string
  landing_page_id: string | null
  name: string
  phone: string
  wilaya: string | null
  status: LeadStatus
  notes: string | null
  created_at: string
  // Joined
  landing_page?: Pick<LandingPage, 'id' | 'title' | 'slug'>
}

// ============================================================
// AD CREATIVE
// ============================================================
export type AdCreativeFormat = 'square' | 'story'
export type AdCreativeStyle = 'elegant' | 'energetic' | 'minimal'

export interface AdCreative {
  id: string
  store_id: string
  landing_page_id: string | null
  product_name: string
  format: AdCreativeFormat
  style: AdCreativeStyle
  image_url: string
  ad_copy: string | null
  created_at: string
  landing_page?: Pick<LandingPage, 'id' | 'title' | 'slug'>
}

export const AD_CREATIVE_FORMAT_LABELS: Record<AdCreativeFormat, string> = {
  square: 'Carré 1:1',
  story: 'Story 9:16',
}

export const AD_CREATIVE_STYLE_LABELS: Record<AdCreativeStyle, string> = {
  elegant: 'Élégant',
  energetic: 'Énergique',
  minimal: 'Minimaliste',
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  converted: 'Converti',
  lost: 'Perdu',
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'text-blue-400 bg-blue-400/10',
  contacted: 'text-yellow-400 bg-yellow-400/10',
  converted: 'text-green-400 bg-green-400/10',
  lost: 'text-gray-400 bg-gray-400/10',
}

// ============================================================
// ORDER
// ============================================================
export interface Order {
  id: string
  store_id: string
  product_id: string | null
  landing_page_id: string | null
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  commune: string
  address: string | null
  quantity: number
  color: string | null
  size: string | null
  unit_price: number
  total_price: number
  delivery_price: number
  status: OrderStatus
  source: OrderSource
  notes: string | null
  // Courier tracking (set when a delivery shipment is created)
  tracking_number: string | null
  delivery_provider: string | null
  delivery_label_url: string | null
  created_at: string
  updated_at: string
  // Joined fields
  product?: Product
  landing_page?: LandingPage
}

// ============================================================
// DELIVERY INTEGRATIONS (per-store courier credentials, BYO-key)
// ============================================================
export type DeliveryProvider = 'yalidine'

export interface DeliveryIntegration {
  id: string
  store_id: string
  provider: DeliveryProvider
  api_id: string     // encrypted at rest
  api_token: string  // encrypted at rest
  from_wilaya: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// SUBSCRIPTION
// ============================================================
export interface Subscription {
  id: string
  store_id: string
  plan: Plan
  amount_dzd: number
  status: SubscriptionPaymentStatus
  payment_method: PaymentMethod | null
  payment_proof_url: string | null
  started_at: string | null
  expires_at: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  rejected_reason: string | null
  notes: string | null
  created_at: string
  // Joined fields
  store?: Store
}

// ============================================================
// CREDIT USAGE
// ============================================================
export interface CreditUsage {
  id: string
  store_id: string
  product_id: string | null
  landing_page_id: string | null
  type: 'landing_page'
  created_at: string
}

// ============================================================
// CHATBOT
// ============================================================
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatbotSession {
  id: string
  store_id: string
  session_id: string
  messages: ChatMessage[]
  order_id: string | null
  customer_phone: string | null
  created_at: string
  updated_at: string
}

export interface ChatbotDailyUsage {
  id: string
  store_id: string
  date: string
  message_count: number
  created_at: string
}

// ============================================================
// MESSAGING CHANNELS
// ============================================================
export type ChannelPlatform = 'messenger' | 'instagram'

// Order `source` values across all chatbot surfaces.
export type ChannelSource = 'chatbot' | 'messenger' | 'instagram'

export interface ChannelConnection {
  id: string
  store_id: string
  platform: ChannelPlatform
  page_id: string | null
  ig_id: string | null
  page_access_token: string // encrypted at rest
  page_name: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// SUPER ADMIN
// ============================================================
export interface SuperAdmin {
  id: string
  user_id: string
  created_at: string
}

// ============================================================
// ALGERIA WILAYAS
// ============================================================
export interface Wilaya {
  code: string
  name: string
  nameAr: string
}

// ============================================================
// ORDER STATUS LABELS (French)
// ============================================================
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  chez_livreur: 'Chez la société de livraison',
  en_livraison: 'En cours de livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
  retournee: 'Retournée',
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  confirmed: 'text-blue-400 bg-blue-400/10',
  chez_livreur: 'text-purple-400 bg-purple-400/10',
  en_livraison: 'text-orange-400 bg-orange-400/10',
  livree: 'text-green-400 bg-green-400/10',
  annulee: 'text-red-400 bg-red-400/10',
  retournee: 'text-gray-400 bg-gray-400/10',
}

export const PLAN_LABELS: Record<Plan, string> = {
  basic: 'Basic',
  pro: 'Pro',
  ultimate: 'Ultimate',
  growth: 'Growth',
  business: 'Business',
  agency: 'Agency',
  enterprise: 'Enterprise',
  sur_mesure: 'Sur Mesure',
}

export const PLAN_PRICES: Record<Plan, string> = {
  basic: '15 000 DZD',
  pro: '3 000 DZD/mois',
  ultimate: '9 000 DZD/mois',
  growth: '12 000 DZD/mois',
  business: '20 000 DZD/mois',
  agency: '35 000 DZD/mois',
  enterprise: '60 000 DZD/mois',
  sur_mesure: 'Sur devis',
}

export const PLAN_CREDITS: Record<Plan, number> = {
  basic: 5,
  pro: 20,
  ultimate: 100,
  growth: 200,
  business: 400,
  agency: 800,
  enterprise: 1500,
  sur_mesure: 0,
}

// Total dashboard seats per plan (owner included). Infinity = unlimited.
export const PLAN_TEAM_LIMITS: Record<Plan, number> = {
  basic: 1,
  pro: 1,
  ultimate: 2,
  growth: 2,
  business: 5,
  agency: Infinity,
  enterprise: Infinity,
  sur_mesure: Infinity,
}

// ============================================================
// TEAM MEMBERS
// ============================================================
export interface TeamMember {
  id: string
  store_id: string
  user_id: string | null
  role: 'member'
  invited_email: string
  invited_by: string | null
  accepted_at: string | null
  created_at: string
}

// Chatbot messages/day per plan. Basic & Pro have the chatbot DISABLED (0).
// sur_mesure is provisioned manually by the super admin.
export const PLAN_CHATBOT_LIMITS: Record<Plan, number> = {
  basic: 0,
  pro: 0,
  ultimate: 150,
  growth: 300,
  business: 600,
  agency: 1000,
  enterprise: 2000,
  sur_mesure: 0,
}
