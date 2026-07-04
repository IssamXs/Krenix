import type { ComponentType } from 'react'
import type { Store, Product, LandingPage } from '@/types/database'
import BeautyStoreHome from './beauty/BeautyStoreHome'
import BeautyLanding from './beauty/BeautyLanding'
import TechStoreHome from './tech/TechStoreHome'
import TechLanding from './tech/TechLanding'
import SportStoreHome from './sport/SportStoreHome'
import SportLanding from './sport/SportLanding'
import CarStoreHome from './car/CarStoreHome'
import CarLanding from './car/CarLanding'
import HomeStoreHome from './home/HomeStoreHome'
import HomeLanding from './home/HomeLanding'

export type StoreHomeProps = {
  store: Store
  products: Product[]
  landingPages?: LandingPage[]
  // product id → slug of the published landing page it backs (opens instead of the modal)
  landingByProduct?: Record<string, string>
}
export type LandingProps = { landingPage: LandingPage; store: Store }

type ThemeTemplates = {
  StoreHome?: ComponentType<StoreHomeProps>
  Landing?: ComponentType<LandingProps>
}

// Slug → bespoke templates. Absent slug → dispatcher uses the generic fallback.
export const THEME_TEMPLATES: Record<string, ThemeTemplates> = {
  'beauty-fashion': { StoreHome: BeautyStoreHome, Landing: BeautyLanding },
  'tech-mobile': { StoreHome: TechStoreHome, Landing: TechLanding },
  'fitness-wellness': { StoreHome: SportStoreHome, Landing: SportLanding },
  'auto-accessories': { StoreHome: CarStoreHome, Landing: CarLanding },
  'home-lifestyle': { StoreHome: HomeStoreHome, Landing: HomeLanding },
}
