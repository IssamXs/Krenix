// Shared shape both dictionaries must satisfy — `satisfies Dictionary` in each
// locale file gives a compile-time error the moment a key exists in one
// language but not the other, so translations can't silently drift apart.
export interface Dictionary {
  common: {
    save: string
    saving: string
    saved: string
    cancel: string
    retry: string
    loading: string
    credits: string
    topUp: string
    continueWithGoogle: string
    continueWithGithub: string
  }
  nav: {
    overview: string
    products: string
    orders: string
    leads: string
    crm: string
    landingPages: string
    chatbot: string
    finance: string
    themes: string
    analytics: string
    integrations: string
    agency: string
    team: string
    settings: string
    billing: string
    viewStore: string
    logout: string
    aiCredits: string
    dashboardTitleFallback: string
  }
  overview: {
    overviewLabel: string
    greeting: string // {name} placeholder
    totalRevenue: string
    orders: string
    averageCart: string
    conversionRate: string
    revenueEvolution: string
    revenueDa: string
    orderTracking: string
    noOrdersInPeriod: string
    topSales: string
    noSalesInPeriod: string
    unitSold: string
    unitsSold: string
    recentOrders: string
    viewAll: string
    noOrdersYet: string
    quickActions: string
    addProduct: string
    viewMyStore: string
    generateLandingPage: string
    pendingOrders: string
    periodToday: string
    periodWeek: string
    periodMonth: string
  }
  auth: {
    login: {
      welcomeBack: string
      subtitle: string
      email: string
      password: string
      forgotPassword: string
      signIn: string
      orContinueWith: string
      noAccount: string
      createStore: string
    }
    register: {
      title: string
      subtitle: string
      benefit1: string
      benefit2: string
      benefit3: string
      email: string
      phone: string
      phoneOptional: string
      phoneHint: string
      password: string
      passwordHint: string
      confirmPassword: string
      createAccount: string
      orSignUpWith: string
      alreadyHaveAccount: string
      signIn: string
      checkEmail: string
      confirmationSentTo: string
      confirmationInstructions: string
      backToLogin: string
    }
  }
  languageSwitcher: {
    label: string
  }
}
