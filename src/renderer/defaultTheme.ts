/**
 * Reproduction of LVGL 9.5's `lv_theme_default` for the preview renderer.
 *
 * Sourced from upstream `release/v9.5/src/themes/default/lv_theme_default.c`
 * and `src/misc/lv_palette.c`. Light + dark, medium-display profile (no DPI
 * scaling — fixed numeric values that match a typical ESP32 240×320/320×480).
 *
 * Consumed by `resolveProp` / `resolvePartProp` in styles.ts as the third
 * resolution layer, after inline widget.props and widget.styles[].
 */
export type ThemePart = Record<string, unknown>;
export type ThemeWidget = Record<string, ThemePart>; // keyed by part name ('main', 'indicator', 'knob', 'track')
export type DefaultTheme = Record<string, ThemeWidget>; // keyed by widget type

/**
 * Extra prop overrides the theme applies on top of `main` when a widget is in a
 * specific LVGL state. Used by the renderer's state-forcing path so that — even
 * if the YAML has no `checked:`/`pressed:`/`disabled:` block — the preview
 * still reflects what `lv_theme_default` would automatically draw.
 */
export type StateOverrides = Partial<Record<'checked' | 'pressed' | 'disabled', ThemePart>>;
export type ThemeStates = Record<string, StateOverrides>; // keyed by widget type

const PALETTE = {
  greyMain: '#9e9e9e',
  greyLight2: '#e0e0e0',
  greyLight4: '#f5f5f5',
  greyLight5: '#fafafa',
  greyDark4: '#212121',
  blueMain: '#2196f3',
  blueLight4: '#bbdefb',
  white: '#ffffff',
} as const;

const RADIUS_CIRCLE = 9999;
const PAD_DEF = 20;
const PAD_SMALL = 12;

interface Tokens {
  scr: string;
  card: string;
  grey: string;
  text: string;
  primary: string;
  secondary: string;
  trackMuted: string;
}

// Default secondary colour from LVGL's theme args (`LV_PALETTE_RED main`).
const SECONDARY = '#f44336';

const LIGHT_TOKENS: Tokens = {
  scr: PALETTE.greyLight4,
  card: PALETTE.white,
  grey: PALETTE.greyLight2,
  text: PALETTE.greyDark4,
  primary: PALETTE.blueMain,
  secondary: SECONDARY,
  trackMuted: PALETTE.blueLight4,
};

const DARK_TOKENS: Tokens = {
  scr: '#15171a',
  card: '#282b30',
  grey: '#2f3237',
  text: PALETTE.greyLight5,
  primary: PALETTE.blueMain,
  secondary: SECONDARY,
  trackMuted: '#1a2a3a',
};

function buildTheme(t: Tokens): DefaultTheme {
  return {
    obj: {
      // LVGL applies the "card" style to non-screen obj instances — white
      // background in light mode, slightly lifted dark grey in dark mode.
      // The actual screen background is painted directly by CanvasStage via
      // `defaultScreenBg(darkMode)` and uses the `scr` token instead.
      main: {
        bg_color: t.card,
        bg_opa: 1,
        text_color: t.text,
        border_color: t.grey,
        border_opa: 0,
        border_width: 0,
        radius: 0,
      },
    },
    button: {
      main: {
        bg_color: t.grey,
        bg_opa: 1,
        text_color: t.text,
        border_opa: 0,
        border_width: 0,
        radius: 12,
        pad_top: PAD_SMALL,
        pad_bottom: PAD_SMALL,
        pad_left: PAD_DEF,
        pad_right: PAD_DEF,
      },
    },
    label: {
      main: {
        text_color: t.text,
        text_opa: 1,
        align: 'TOP_LEFT',
      },
    },
    slider: {
      main: {
        bg_color: t.trackMuted,
        bg_opa: 1,
        border_opa: 0,
        radius: RADIUS_CIRCLE,
      },
      indicator: {
        bg_color: t.primary,
        bg_opa: 1,
        border_opa: 0,
        radius: RADIUS_CIRCLE,
      },
      knob: {
        bg_color: t.primary,
        bg_opa: 1,
        border_opa: 0,
        radius: RADIUS_CIRCLE,
        pad_all: 6,
      },
    },
    bar: {
      main: {
        bg_color: t.trackMuted,
        bg_opa: 1,
        border_opa: 0,
        radius: RADIUS_CIRCLE,
      },
      indicator: {
        bg_color: t.primary,
        bg_opa: 1,
        border_opa: 0,
        radius: RADIUS_CIRCLE,
      },
    },
    spinner: {
      main: {
        arc_color: t.grey,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
      indicator: {
        arc_color: t.primary,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
    },
    arc: {
      main: {
        arc_color: t.grey,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
      indicator: {
        arc_color: t.primary,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
      knob: {
        bg_color: t.primary,
        bg_opa: 1,
        border_opa: 0,
        border_width: 0,
        radius: RADIUS_CIRCLE,
        pad_all: 0,
      },
    },
  };
}

export const LIGHT_THEME: DefaultTheme = buildTheme(LIGHT_TOKENS);
export const DARK_THEME: DefaultTheme = buildTheme(DARK_TOKENS);

/**
 * State-driven theme overrides. Replicates the per-state styles the LVGL
 * default theme automatically applies (e.g. button checked → secondary bg).
 *
 * The renderer merges these on top of widget.props (and beneath any explicit
 * inline `checked:`/`pressed:`/`disabled:` block) only when the inspector is
 * actively forcing that state — see `maybeForceState` in CanvasStage.
 *
 * Note: LVGL also applies a `recolor` overlay for `pressed` (black @ 35% opa)
 * and `disabled` (grey @ 50% opa) — those need color-mixing in the renderer
 * and aren't represented here yet.
 */
export const THEME_STATES: ThemeStates = {
  button: {
    checked: { bg_color: SECONDARY },
  },
};

export function getDefaultTheme(darkMode: boolean): DefaultTheme {
  return darkMode ? DARK_THEME : LIGHT_THEME;
}

export function getThemeStates(): ThemeStates {
  return THEME_STATES;
}

/** Default screen background colour for the active mode (used by CanvasStage to clear the canvas). */
export function defaultScreenBg(darkMode: boolean): string {
  return darkMode ? DARK_TOKENS.scr : LIGHT_TOKENS.scr;
}
