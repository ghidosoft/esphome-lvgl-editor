# Samples

Self-contained ESPHome configs that demonstrate the LVGL features the editor
currently renders. Run any of them with:

```sh
esphome-lvgl-editor samples/        # this directory
esphome-lvgl-editor --demo          # uses these bundled samples
```

Each file is a complete, minimal ESPHome config — no `!include`, no `packages`,
no external substitutions. They are derived from the official
[ESPHome LVGL cookbook](https://esphome.io/cookbook/lvgl/) and trimmed to fit
the supported widget set.

## Index

| File | Cookbook reference | Demonstrates |
| --- | --- | --- |
| [01-remote-light-button.yaml](01-remote-light-button.yaml) | [Remote light button](https://esphome.io/cookbook/lvgl/#remote-light-button) | `button` (checkable), `label`, alignment, basic styling |
| [02-brightness-slider.yaml](02-brightness-slider.yaml) | [Light brightness slider](https://esphome.io/cookbook/lvgl/#light-brightness-slider) | `slider` with `min_value`/`max_value`/`value`, knob & indicator parts |
| [03-flex-layout.yaml](03-flex-layout.yaml) | [Flex layout positioning](https://esphome.io/cookbook/lvgl/#flex-layout-positioning) | `obj` with FLEX layout, `flex_flow: ROW`, `pad_row`/`pad_column` |
| [04-grid-layout.yaml](04-grid-layout.yaml) | [Grid layout positioning](https://esphome.io/cookbook/lvgl/#grid-layout-positioning) | GRID layout, FR units, `grid_cell_*_pos`, `grid_cell_column_span` |
| [05-boot-screen.yaml](05-boot-screen.yaml) | [ESPHome boot screen](https://esphome.io/cookbook/lvgl/#esphome-boot-screen) | full-screen `obj` overlay, `spinner`, nested centered content |
| [06-multi-page.yaml](06-multi-page.yaml) | [Page navigation footer](https://esphome.io/cookbook/lvgl/#page-navigation-footer) (adapted) | multiple `pages`, `on_click: lvgl.page.show` navigation |

## Roadmap: cookbook examples not yet renderable

The cookbook covers more widgets and behaviors than the editor currently
draws. The list below is the gap to close before the editor can claim
"renders the full cookbook":

| Widget / feature | Cookbook examples that use it |
| --- | --- |
| `arc` | semicircle gauge, thermometers |
| `bar` | (used implicitly in many gauges) |
| `meter` | gauge, thermometers, analog clock |
| `switch` | local light switch, theme example |
| `buttonmatrix` | page navigation footer, numeric keypad, theme example |
| `spinbox` | climate control, numeric keypad |
| `checkbox` | "fix missing checkbox" |
| `dropdown` / `roller` | "fix missing chevron" |
| `line` (as meter indicator) | meter indicators |
| `top_layer` overlay slot | boot screen, API status icon, page nav, title bar |
| Animations (rotate, fade, position) | boot screen fade, charging icon, burn-in offset |
| State-specific styles (pressed/checked transitions) | theme example |

When the editor learns one of these, the matching cookbook example becomes a
candidate for the samples set.
