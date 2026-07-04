interface IconProps {
  size?: number
  className?: string
}

export function IconStore({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 11V21H21V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 11L12 3L23 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21V15.5C9 14.7 9.7 14 10.5 14H13.5C14.3 14 15 14.7 15 15.5V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="3.5" y="12" width="4.5" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="16" y="12" width="4.5" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.75 12V16" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      <path d="M3.5 14H8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      <path d="M18.25 12V16" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      <path d="M16 14H20.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconAIPage({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M14 2H6C5.4 2 5 2.4 5 3V21C5 21.6 5.4 22 6 22H18C18.6 22 19 21.6 19 21V7L14 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2V7H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 12H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 15H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 9H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M17 14L18.2 17.2L21.5 18L18.2 18.8L17 22L15.8 18.8L12.5 18L15.8 17.2L17 14Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15"/>
    </svg>
  )
}

export function IconChatbot({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M21 15C21 15.5 20.8 16 20.4 16.4C20 16.8 19.5 17 19 17H7L3 21V5C3 4.5 3.2 4 3.6 3.6C4 3.2 4.5 3 5 3H19C19.5 3 20 3.2 20.4 3.6C20.8 4 21 4.5 21 5V15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8" cy="10" r="1.3" fill="currentColor"/>
      <circle cx="12" cy="10" r="1.3" fill="currentColor"/>
      <circle cx="16" cy="10" r="1.3" fill="currentColor"/>
    </svg>
  )
}

export function IconRocket({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 2C12 2 7.5 6.5 7.5 13L9.5 15H14.5L16.5 13C16.5 6.5 12 2 12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M9.5 15L8 17.5C8 17.5 9 18.5 10 18C10 18 10 20 12 22C14 20 14 18 14 18C15 18.5 16 17.5 16 17.5L14.5 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 12L5.5 11L6.5 14.5L9.5 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16.5 12L18.5 11L17.5 14.5L14.5 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconPackage({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Front face */}
      <path d="M4 10.5H16V21H4V10.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Top lid */}
      <path d="M2 7.5H18V10.5H2V7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Right side (3D) */}
      <path d="M16 10.5L20 8V17L16 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18 7.5L22 5.5V8L18 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Ribbon vertical */}
      <path d="M10 7.5V21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      {/* Bow detail */}
      <path d="M8.5 7.5C8.5 5.5 10 5 10 5C10 5 11.5 5.5 11.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function IconAnalytics({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 3V21H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="5" y="14" width="3.5" height="7" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
      <rect x="10" y="10" width="3.5" height="11" rx="0.5" fill="currentColor" fillOpacity="0.7"/>
      <rect x="15" y="6" width="3.5" height="15" rx="0.5" fill="currentColor" fillOpacity="0.9"/>
      <path d="M6 16L11 12L16 8L21 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18 4L21 5L20 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
