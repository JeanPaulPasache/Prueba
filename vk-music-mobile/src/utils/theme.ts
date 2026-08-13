// Tema centralizado de la app.
// Paleta: negro como base, rojo como acento, blanco/gris para texto.
// Cambiar cualquier valor acá se propaga a toda la app.

export const colors = {
  // Superficies (de más oscura a más clara → crea profundidad por capas)
  background: '#0A0A0A',
  surface: '#161616',
  surfaceElevated: '#1F1F1F',
  border: '#2A2A2A',

  // Acento (rojo). Dos intensidades: una para elementos activos/sólidos,
  // otra más apagada para fondos sutiles (ej. fila activa).
  accent: '#E5383B',
  accentMuted: '#3A1517',
  accentPressed: '#C42D30',

  // Texto
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#6B6B6B',

  // Estados
  danger: '#E5383B',
  overlay: 'rgba(0,0,0,0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const typography = {
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.textTertiary,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  button: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
};
