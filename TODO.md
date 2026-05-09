# LVGL Editor — TODO

Loose roadmap, grouped by horizon. Not binding: order and priority shift as
the tool gets used.

## Short-term (quality of life, MVP polish)

- [ ] **Local image files**: support `file:` pointing at a disk path (serve via a `/__lvgl/asset/` endpoint sandboxed to `esphome/`).
- [ ] **`grid_cell_*_align: CENTER/START/END`** non-STRETCH: only partially handled — verify against real usage.
- [x] ~~`pad_row`/`pad_column` on layout-less containers~~: closed as out-of-scope — LVGL upstream doesn't use these as inset either (they're style props consumed only by flex/grid layout engines as gap, plus widgets like `checkbox` that read them directly). Per-side `pad_top/right/bottom/left` and `pad_all` are already honoured as inset (see `applyPadding` in `src/renderer/boxes.ts`).
- [x] **Explicit `text_align: LEFT/RIGHT/CENTER`** on labels — overrides the alignment inferred from `align:` (`AUTO` keeps inference). See `src/renderer/widgets/label.ts`.
- [x] **Multi-line label**: `long_mode: WRAP` (word-wrap), `BREAK` (char-wrap), `DOT` (single-line ellipsis). `SCROLL`/`SCROLL_CIRCULAR` still out of scope.
- [ ] **DPR scaling**: crisp canvas on retina displays (currently 1:1).
- [ ] **Cosmetic save diffs from eemeli re-stringify**: even with `flowCollectionPadding:false` + `lineWidth:0`, a single edit can touch a handful of unrelated lines (hex case normalized `0xFF`→`0xff`, orphan comments re-indented between top-level blocks). Semantically identical, ESPHome-safe, but ugly in git diffs. Real fix would require CST-level patching instead of `doc.setIn` + `doc.toString()`.
- [ ] **Error overlay**: when the parser hits `ProjectLoadError`, show file path + message in a banner instead of an empty canvas.
- [ ] **Sidebar filtering**: exclude files that aren't actual ESPHome projects (e.g. `merged/*.yaml` — only top-level entries are excluded today).
- [ ] **`clip_corner` in overflow clip**: children are currently clipped to the parent's rectangular `drawn` box; honor rounded-corner clipping when the parent has `radius` + `clip_corner` (LVGL's flag for clipping children along the border-radius).
- [ ] **Scroll indication on overflow**: when children exceed the parent's content area, LVGL shows a scrollbar by default (unless `scrollbar_mode: off`). We currently just clip the overflow silently — surface it (scrollbar rendering, or at least a visual overflow hint) so the editor flags the same layout issues the device does.
- [ ] **Unexplained ~2 px inset on flex containers**: on `irrigation_page` the STOP button fit at `width: 96` on-device while our math (container 452, children 105+105+120+100 + 3×8 gap = 454) said it should fit at `width: 98`. A 2 px delta is unaccounted — candidates: default `pad_left`/`pad_right` on plain `obj`, scrollbar gutter reservation even with `scrollbar_mode: off`, or a rounding/sub-pixel effect in LVGL's flex. Worth instrumenting once we have a side-by-side device capture.

## Medium-term (open features)

- [ ] **`buttonmatrix` widget**: grid of buttons defined inline (used by page-nav footers, numeric keypads, theme example). Self-contained: a single widget node renders multiple cells.
- [ ] **`spinbox` widget**: numeric input with up/down buttons (climate control, keypad).
- [ ] **`dropdown` / `roller` widgets**: collapsible / scrollable option pickers.
- [ ] **`top_layer` overlay slot**: separate render layer always drawn on top of the active page (used for boot screen, API status icon, persistent title bars). Needs a small additions to the page model so widgets in `lvgl.top_layer:` always paint last.
- [ ] **Page navigation via `on_click: lvgl.page.show`**: clicking on the canvas should switch the active page. Turns the preview into a navigable prototype.
- [ ] **Page-transition animations**: `FADE_IN`, `MOVE_LEFT` as a visual transition when switching pages (via `on_click` or sidebar).
- [ ] **Interactive sliders/bars**: dragging the knob in the preview updates a local `value` (no write-back to YAML) — useful for testing ranges.
- [ ] **Real embedded fonts**: compile Montserrat to bitmaps at the sizes used by the display (e.g. 36/28/14/12/10) for pixel-perfect fidelity, instead of approximating via Google Fonts in the browser.
- [ ] **Material Symbols aliases**: a small `glyph_xxx → code point` dictionary so YAML can reference icons by name instead of hardcoded `\uE...` escapes.
- [ ] **Source view**: side panel showing the raw YAML source of the selected page/widget (currently we show only key/value + origin file, not the literal YAML block).
- [ ] **Widget tree panel**: hierarchical view of the page's widget tree with click-to-select and collapse/expand. Especially useful when children tightly wrap their parent (e.g. `SIZE_CONTENT` containers) and click-selection alone can't reach every node.
- [ ] **Pan & zoom** of the canvas: inspect details without zooming the whole browser.
- [ ] **PNG snapshot**: an "export frame" button to capture the preview (handy for PRs / docs).
- [ ] **Multi-device**: side-by-side list of multiple display projects, same YAML rendered at different sizes (for future responsive testing).
- [ ] **Testing**: vitest on the parser (edge cases: circular includes, missing substitutions, package merge), Playwright on the renderer (pixel snapshot tests for regressions).

## Long-term (the actual goals of the project)

- [ ] **Home Assistant integration**: connect to HA's WebSocket to populate `text_sensor`/`sensor` values and see real data in the preview (weather, living-room temperature, irrigation status).
  - Config: HA URL + long-lived token in `.env.local`.
  - Fallback: mock values when disconnected.
- [ ] **`async_online_image` stream**: support the real radar widget (fetch the 6 frame URLs from HA, crossfade like on the device).
- [ ] **Drag & drop**: reposition widgets, move them across containers, create new ones from a palette. Needs precise hit-testing (the reason we picked Canvas 2D over WASM).
- [ ] **Sensor simulator**: sliders to fake temperature/humidity/etc. without HA — useful for mockups.
- [x] **Public packaging**: ship as a CLI `npx esphome-lvgl-editor [path]` so it can be used against any ESPHome project, not just this repo. Bundled `samples/` from the cookbook for `--demo` mode. (See `samples/README.md` for the cookbook gap that gates the actual `npm publish`.)
- [ ] **Monorepo consolidation**: if it goes public, fold `scripts/merge-lvgl.mjs` into the same package and have it use `lvgl-editor/src/parser` (share the logic instead of duplicating it).

## Architectural notes for later

- The parser in `src/parser/` is isomorphic (no `fs` in the type-level modules) — already shaped to be extracted as a standalone package.
- The renderer in `src/renderer/` doesn't depend on React — it can be reused in Storybook / Electron / CLI without changes.
- Editing pipeline: parser now uses `eemeli/yaml` and keeps `Document` CSTs in a server-side `FileRegistry` for round-trip saves (comments + formatting preserved). Client only sends `{file, yamlPath, newValue}` edit ops — no YAML serializer in the browser.
- For "interactive navigation" mode: keep the current-page state out of the URL/router (which only exists for deep-linking) so the active page can stay independent of the URL when previewing transitions.
