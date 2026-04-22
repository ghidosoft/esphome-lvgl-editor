# LVGL Editor — TODO

Loose roadmap, grouped by horizon. Not binding: order and priority shift as
the tool gets used.

## Short-term (quality of life, MVP polish)

- [ ] **`arc` widget**: used in LVGL for gauges / progress rings. Render similar to `spinner` but driven by `value` + `min_value`/`max_value`.
- [ ] **`bar` widget**: horizontal progress bar (track + indicator). Like `slider` minus the knob.
- [ ] **Image-id resolver**: when `image: src: some_id`, look up the project's top-level `image:` block (`file: https://…` or local path). Today every `image:` falls back to a placeholder.
- [ ] **Local image files**: support `file:` pointing at a disk path (serve via a `/__lvgl/asset/` endpoint sandboxed to `esphome/`).
- [ ] **Robust percentage sizes** (`width: "100%"`) and `SIZE_CONTENT` approximated to children's bounding box (currently falls back to parent size).
- [ ] **`grid_cell_*_align: CENTER/START/END`** non-STRETCH: only partially handled — verify against real usage.
- [ ] **`pad_row`/`pad_column` on layout-less containers**: today only `pad_all` is honoured as inset; per-axis padding isn't.
- [ ] **Explicit `text_align: LEFT/RIGHT/CENTER`** on labels (currently inferred from `align`).
- [ ] **Multi-line label**: word-wrap when `long_mode: WRAP` / `BREAK`.
- [ ] **DPR scaling**: crisp canvas on retina displays (currently 1:1).
- [ ] **Error overlay**: when the parser hits `ProjectLoadError`, show file path + message in a banner instead of an empty canvas.
- [ ] **Sidebar filtering**: exclude files that aren't actual ESPHome projects (e.g. `merged/*.yaml` — only top-level entries are excluded today).

## Medium-term (open features)

- [ ] **Page navigation via `on_click: lvgl.page.show`**: clicking on the canvas should switch the active page. Turns the preview into a navigable prototype.
- [ ] **State toggles**: `pressed:` / `checked:` / `disabled:` exposed as UI tabs to inspect every state of a widget without editing the YAML.
- [ ] **Page-transition animations**: `FADE_IN`, `MOVE_LEFT` as a visual transition when switching pages (via `on_click` or sidebar).
- [ ] **Animated spinner**: currently static at 270°, add rotation (RAF) for realism.
- [ ] **Interactive sliders/bars**: dragging the knob in the preview updates a local `value` (no write-back to YAML) — useful for testing ranges.
- [ ] **Real embedded fonts**: compile Montserrat to bitmaps at the sizes used by the display (e.g. 36/28/14/12/10) for pixel-perfect fidelity, instead of approximating via Google Fonts in the browser.
- [ ] **Material Symbols aliases**: a small `glyph_xxx → code point` dictionary so YAML can reference icons by name instead of hardcoded `\uE...` escapes.
- [ ] **Source view**: side panel showing the YAML source of the selected page/widget (read-only), with a link back to the file.
- [ ] **Pan & zoom** of the canvas: inspect details without zooming the whole browser.
- [ ] **PNG snapshot**: an "export frame" button to capture the preview (handy for PRs / docs).
- [ ] **Multi-device**: side-by-side list of multiple display projects, same YAML rendered at different sizes (for future responsive testing).
- [ ] **Testing**: vitest on the parser (edge cases: circular includes, missing substitutions, package merge), Playwright on the renderer (pixel snapshot tests for regressions).

## Long-term (the actual goals of the project)

- [ ] **Home Assistant integration**: connect to HA's WebSocket to populate `text_sensor`/`sensor` values and see real data in the preview (weather, living-room temperature, irrigation status).
  - Config: HA URL + long-lived token in `.env.local`.
  - Fallback: mock values when disconnected.
- [ ] **`async_online_image` stream**: support the real radar widget (fetch the 6 frame URLs from HA, crossfade like on the device).
- [ ] **Visual editing**: select a widget on the canvas → properties panel → tweak `text_color`, `radius`, etc. → write back to the YAML source (`eemeli/yaml` preserves comments — better than `js-yaml` for this).
- [ ] **Drag & drop**: reposition widgets, move them across containers, create new ones from a palette. Needs precise hit-testing (the reason we picked Canvas 2D over WASM).
- [ ] **Global style editor**: separate tab for `style_definitions`, edit `color_accent_*` via a color picker → updates `theme.yaml`.
- [ ] **Sensor simulator**: sliders to fake temperature/humidity/etc. without HA — useful for mockups.
- [ ] **Public packaging**: ship as a CLI `npx esphome-lvgl-preview <path>` so it can be used against any ESPHome project, not just this repo.
- [ ] **Monorepo consolidation**: if it goes public, fold `scripts/merge-lvgl.mjs` into the same package and have it use `lvgl-editor/src/parser` (share the logic instead of duplicating it).

## Architectural notes for later

- The parser in `src/parser/` is isomorphic (no `fs` in the type-level modules) — already shaped to be extracted as a standalone package.
- The renderer in `src/renderer/` doesn't depend on React — it can be reused in Storybook / Electron / CLI without changes.
- For editing: `eemeli/yaml` offers round-trip with preserved comments and layout — worth evaluating once we start writing files back.
- For "interactive navigation" mode: keep the current-page state out of the URL/router (which only exists for deep-linking) so the active page can stay independent of the URL when previewing transitions.
