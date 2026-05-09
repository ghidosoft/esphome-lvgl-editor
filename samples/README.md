# Samples

Self-contained ESPHome configs derived from the official
[ESPHome LVGL cookbook](https://esphome.io/cookbook/lvgl/). Run any of them
with:

```sh
esphome-lvgl-editor samples/        # this directory
esphome-lvgl-editor --demo          # uses these bundled samples
```

Each file is a complete, minimal ESPHome config — no `!include`, no `packages`,
no external substitutions.

The set is split into two groups: samples that **render today** with the
current widget support, and samples that exist as **forward-looking targets**
for widgets/features the editor doesn't draw yet. The second group will start
rendering correctly as the renderer grows; until then they appear in the
sidebar but show only the parts the editor already knows about.

## Renders today

| File | Cookbook reference | Demonstrates |
| --- | --- | --- |
| [01-remote-light-button.yaml](01-remote-light-button.yaml) | [Remote light button](https://esphome.io/cookbook/lvgl/#remote-light-button) | `button` (checkable), `label`, alignment, basic styling |
| [02-brightness-slider.yaml](02-brightness-slider.yaml) | [Light brightness slider](https://esphome.io/cookbook/lvgl/#light-brightness-slider) | `slider` with `min_value`/`max_value`/`value`, knob & indicator parts |
| [03-flex-layout.yaml](03-flex-layout.yaml) | [Flex layout positioning](https://esphome.io/cookbook/lvgl/#flex-layout-positioning) | `obj` with FLEX layout, `flex_flow: ROW`, `pad_row`/`pad_column` |
| [04-grid-layout.yaml](04-grid-layout.yaml) | [Grid layout positioning](https://esphome.io/cookbook/lvgl/#grid-layout-positioning) | GRID layout, FR units, `grid_cell_*_pos`, `grid_cell_column_span` |
| [05-boot-screen.yaml](05-boot-screen.yaml) | [ESPHome boot screen](https://esphome.io/cookbook/lvgl/#esphome-boot-screen) | full-screen `obj` overlay, `spinner`, nested centered content |
| [06-multi-page.yaml](06-multi-page.yaml) | [Page navigation footer](https://esphome.io/cookbook/lvgl/#page-navigation-footer) (adapted) | multiple `pages`, `on_click: lvgl.page.show` navigation |
| [13-analog-clock.yaml](13-analog-clock.yaml) | [Analog clock](https://esphome.io/cookbook/lvgl/#analog-clock) | `meter` with full-circle scale, hour/minute `line` needles |
| [14-thermometer.yaml](14-thermometer.yaml) | [Thermometer](https://esphome.io/cookbook/lvgl/#meter) | dual-scale `meter`, `tick_style` colour gradient, percent-based needle |
| [15-label-styles.yaml](15-label-styles.yaml) | (no cookbook equivalent — editor-feature showcase) | `text_align: LEFT/CENTER/RIGHT`, `long_mode: WRAP/BREAK/DOT` |

## Pending renderer support

These ship the cookbook YAML as-is, including widgets the editor cannot draw
yet. They serve as a checklist: each one lights up as soon as its widget is
implemented.

| File | Cookbook reference | Widget gap |
| --- | --- | --- |
| [07-arc-dial.yaml](07-arc-dial.yaml) | (no cookbook equivalent — mirrors LVGL's `lv_example_arc_1`) | `arc` |
| [08-local-light-switch.yaml](08-local-light-switch.yaml) | [Local light switch](https://esphome.io/cookbook/lvgl/#local-light-switch) | `switch` |
| [09-numeric-keypad.yaml](09-numeric-keypad.yaml) | [Numeric keypad](https://esphome.io/cookbook/lvgl/#numeric-keypad) | `buttonmatrix` |
| [10-climate-spinbox.yaml](10-climate-spinbox.yaml) | [Climate control](https://esphome.io/cookbook/lvgl/#climate-control) | `spinbox` |
| [11-checkbox-list.yaml](11-checkbox-list.yaml) | [Checkbox](https://esphome.io/cookbook/lvgl/#checkbox) | `checkbox` |
| [12-roller-picker.yaml](12-roller-picker.yaml) | [Roller](https://esphome.io/cookbook/lvgl/#roller) | `roller` / `dropdown` |

## Roadmap: gaps still uncovered by samples

Widgets/features without a sample yet, for whoever wants to extend the set:

| Widget / feature | Cookbook examples that use it |
| --- | --- |
| `bar` | (used implicitly in many gauges) |
| State-specific styles (pressed/checked transitions) | theme example |
| Top-layer overlay slot (`top_layer:`) | boot screen overlay variant |
| Animations (fade, rotate, position) | boot screen fade, charging icon, burn-in offset |
