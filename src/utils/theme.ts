/**
 * App visual system: dark background, Fraunces headings, Inter body.
 * 8pt grid, card radius 16, screen padding 16, row height 56.
 */

/** Font family names – load via useFonts in App before use. */
export const fontFamilies = {
  heading: 'Fraunces_700Bold',
  headingSemi: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const theme = {
  colors: {
    background: '#0B0B0D',
    surface: '#121216',
    card: '#121216',
    border: '#1F1F26',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textTertiary: '#6B7280',
    positive: '#22C55E',
    negative: '#EF4444',
    accent: '#7C3AED',
    /** Aliases for compatibility. */
    primary: '#FFFFFF',
    white: '#FFFFFF',
    text: '#FFFFFF',
    textMuted: '#6B7280',
    error: '#EF4444',
    success: '#22C55E',
  },
  /** 8pt grid */
  spacing: {
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 40,
    xxl: 48,
    row: 56,
  },
  layout: {
    screenPadding: 16,
    cardRadius: 16,
    rowHeight: 56,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 9999,
    full: 9999,
  },
  typography: {
    title: {
      fontFamily: fontFamilies.heading,
      fontSize: 30,
      fontWeight: '700' as const,
    },
    title2: {
      fontFamily: fontFamilies.headingSemi,
      fontSize: 24,
      fontWeight: '600' as const,
    },
    body: {
      fontFamily: fontFamilies.body,
      fontSize: 17,
      fontWeight: '400' as const,
    },
    bodyMedium: {
      fontFamily: fontFamilies.bodyMedium,
      fontSize: 17,
      fontWeight: '500' as const,
    },
    bodySemi: {
      fontFamily: fontFamilies.bodySemi,
      fontSize: 17,
      fontWeight: '600' as const,
    },
    caption: {
      fontFamily: fontFamilies.body,
      fontSize: 16,
      fontWeight: '400' as const,
    },
    captionMedium: {
      fontFamily: fontFamilies.bodyMedium,
      fontSize: 16,
      fontWeight: '500' as const,
    },
    small: {
      fontFamily: fontFamilies.body,
      fontSize: 14,
      fontWeight: '400' as const,
    },
  },
} as const;
