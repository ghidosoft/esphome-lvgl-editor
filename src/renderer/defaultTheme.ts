/**
 * Reproduction of LVGL 9.5's `lv_theme_default` for the preview renderer.
 *
 * Architecture: a structural skeleton (encoded inline in `composeTheme`)
 * plus mode-specific palettes (`lightPalette`, `darkPalette`) that supply
 * the colour tokens. Composing a palette into the skeleton produces a
 * `DefaultTheme` ready for the renderer. To add a custom theme, define a
 * new `Palette` and call `composeTheme(palette)`.
 *
 * Sourced from upstream `release/v9.5/src/themes/default/lv_theme_default.c`
 * and `src/misc/lv_palette.c`. Medium-display profile (no DPI scaling —
 * fixed numeric values that match a typical ESP32 240×320/320×480).
 *
 * Consumed by `resolveProp` / `resolvePartProp` in styles.ts as the
 * third+fourth resolution layer, after inline widget.props and
 * widget.styles[]. `theme.obj.main` acts as the universal base —
 * `resolveProp` falls through to it for any widget that doesn't override
 * the key on its own `main` part (mirrors LVGL's "every widget extends
 * lv_obj").
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

// ─── Base structural defaults ────────────────────────────────────────────
// Numeric constants applied uniformly across light/dark — they describe the
// LVGL default theme's geometry, not its colour scheme.
const RADIUS_CIRCLE = 9999;
const PAD_DEF = 20;
const PAD_SMALL = 12;

// ─── Palettes ────────────────────────────────────────────────────────────
// Raw colour swatches reused across palettes. Internal — palette consumers
// should reference the semantic `Palette` tokens, not these.
const RAW_COLORS = {
  greyMain: '#9e9e9e',
  greyLight2: '#e0e0e0',
  greyLight4: '#f5f5f5',
  greyLight5: '#fafafa',
  greyDark4: '#212121',
  blueMain: '#2196f3',
  blueLight4: '#bbdefb',
  white: '#ffffff',
} as const;

// Default secondary colour from LVGL's theme args (`LV_PALETTE_RED main`).
const SECONDARY = '#f44336';

/**
 * Semantic colour tokens consumed by `composeTheme`. A palette is the only
 * thing that varies between light and dark mode; everything else (pads,
 * radii, opacities, sizes) is encoded directly in the skeleton.
 */
export interface Palette {
  scr: string;
  card: string;
  grey: string;
  text: string;
  primary: string;
  secondary: string;
  trackMuted: string;
}

export const lightPalette: Palette = {
  scr: RAW_COLORS.greyLight4,
  card: RAW_COLORS.white,
  grey: RAW_COLORS.greyLight2,
  text: RAW_COLORS.greyDark4,
  primary: RAW_COLORS.blueMain,
  secondary: SECONDARY,
  trackMuted: RAW_COLORS.blueLight4,
};

export const darkPalette: Palette = {
  scr: '#15171a',
  card: '#282b30',
  grey: '#2f3237',
  text: RAW_COLORS.greyLight5,
  primary: RAW_COLORS.blueMain,
  secondary: SECONDARY,
  trackMuted: '#1a2a3a',
};

/**
 * Build the full theme from a palette. The structural skeleton (pads, radii,
 * opacities, sizes) is encoded inline; only colour values come from the
 * palette argument. `obj.main` collects the universal defaults that the
 * cascade in `resolveProp` falls back to for every widget — per-widget
 * `main` parts list only the props that diverge from those.
 */
export function composeTheme(p: Palette): DefaultTheme {
  return {
    obj: {
      // Universal defaults — every widget inherits these via the obj.main
      // fallback in resolveProp/resolvePartProp. LVGL's screen background
      // is painted by CanvasStage via `defaultScreenBg(darkMode)` (uses
      // `scr` token); non-screen obj instances draw the card style below.
      main: {
        bg_color: p.card,
        bg_opa: 1,
        text_color: p.text,
        text_opa: 1,
        border_color: p.grey,
        border_opa: 0,
        border_width: 0,
        radius: 0,
        pad_all: 0,
        pad_row: 0,
        pad_column: 0,
        align: 'TOP_LEFT',
      },
    },
    button: {
      main: {
        bg_color: p.grey,
        radius: 12,
        pad_top: PAD_SMALL,
        pad_bottom: PAD_SMALL,
        pad_left: PAD_DEF,
        pad_right: PAD_DEF,
      },
    },
    // label.main has no overrides — every default cascades from obj.main.
    label: {
      main: {},
    },
    slider: {
      main: {
        bg_color: p.trackMuted,
        radius: RADIUS_CIRCLE,
      },
      indicator: {
        bg_color: p.primary,
        radius: RADIUS_CIRCLE,
      },
      knob: {
        bg_color: p.primary,
        radius: RADIUS_CIRCLE,
        pad_all: 6,
      },
    },
    bar: {
      main: {
        bg_color: p.trackMuted,
        radius: RADIUS_CIRCLE,
      },
      indicator: {
        bg_color: p.primary,
        radius: RADIUS_CIRCLE,
      },
    },
    checkbox: {
      // LVGL: width_def = height_def = SIZE_CONTENT — the checkbox sizes
      // itself to indicator + gap + label. The renderer's `measureCheckbox`
      // produces those numbers; here we just signal the SIZE_CONTENT default.
      main: {
        width: 'SIZE_CONTENT',
        height: 'SIZE_CONTENT',
        bg_opa: 0,
        pad_column: 8,
      },
      indicator: {
        // No bg_color set: the renderer flips between card (off) and primary
        // (on) based on the checked state, mirroring how the default theme
        // adds `bg_color_primary` only on `LV_STATE_CHECKED`. `bg_opa: 1`
        // is explicit because checkbox.main sets `bg_opa: 0` (transparent
        // checkbox surface) — without the override the indicator would
        // inherit that and disappear.
        bg_opa: 1,
        border_color: p.primary,
        border_width: 2,
        border_opa: 1,
        radius: 4,
        pad_all: 3,
      },
    },
    switch: {
      // LVGL default: 40% of DPI × 23.5% of DPI. At a typical 130 DPI that's
      // ~52×30; we round to a clean 50×25 to match what the cookbook samples
      // produce on a 320×240 display.
      main: {
        width: 50,
        height: 25,
        bg_color: RAW_COLORS.greyMain,
        radius: RADIUS_CIRCLE,
      },
      indicator: {
        bg_color: p.primary,
        radius: RADIUS_CIRCLE,
      },
      knob: {
        bg_color: RAW_COLORS.white,
        radius: RADIUS_CIRCLE,
        // Negative pad in LVGL's switch *shrinks* the knob (see lv_switch.c —
        // `knob_area.x1 -= knob_left` with a negative pad insets the bbox).
        // The default theme's value of -4 produces the iOS/Material look
        // where the knob is slightly smaller than the track.
        pad_all: -4,
      },
    },
    buttonmatrix: {
      // LVGL 9 default: card-coloured container + button-styled cells. The
      // `items_checked` / `items_disabled` parts aren't real LVGL parts — the
      // buttonmatrix renderer reads them as synthetic state-overrides for the
      // `items` part (see src/renderer/widgets/buttonmatrix.ts).
      main: {
        bg_color: p.card,
        border_opa: 0,
        radius: 8,
        pad_all: 5,
        pad_row: 4,
        pad_column: 4,
      },
      items: {
        bg_color: p.grey,
        text_color: p.text,
        radius: 4,
        border_width: 0,
      },
      items_checked: {
        bg_color: p.primary,
        text_color: p.card,
      },
      items_disabled: {
        bg_color: p.grey,
        text_color: p.text,
        bg_opa: 0.5,
      },
    },
    spinner: {
      main: {
        arc_color: p.grey,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
      indicator: {
        arc_color: p.primary,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
    },
    arc: {
      main: {
        arc_color: p.grey,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
      indicator: {
        arc_color: p.primary,
        arc_opa: 1,
        arc_width: 10,
        arc_rounded: true,
      },
      knob: {
        bg_color: p.primary,
        radius: RADIUS_CIRCLE,
      },
    },
    meter: {
      // LVGL 8.x default theme: card + circle. The meter draws as a circular
      // card by default; cookbook examples opt out via `bg_opa: 0` when they
      // want a bare gauge.
      main: {
        border_opa: 1,
        border_width: 1,
        radius: RADIUS_CIRCLE,
      },
      // INDICATOR part drives the central pivot dot under the needles
      // (`drawPivotDot` in widgets/meter.ts). LVGL's default theme sets
      // size=15 (via lv_style_set_size), bg_color=text token, full circle.
      indicator: {
        width: 15,
        height: 15,
        bg_color: p.text,
        radius: RADIUS_CIRCLE,
      },
    },
  };
}

export const LIGHT_THEME: DefaultTheme = composeTheme(lightPalette);
export const DARK_THEME: DefaultTheme = composeTheme(darkPalette);

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
  return darkMode ? darkPalette.scr : lightPalette.scr;
}
