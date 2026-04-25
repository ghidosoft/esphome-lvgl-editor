# esphome-lvgl-editor

Web-based preview and visual editor for [ESPHome](https://esphome.io/) LVGL
display configurations. Point it at a folder of ESPHome `*.yaml` files,
open it in a browser, and see the LVGL pages rendered the way the device
would draw them — without flashing firmware.

Edit literals (text, colors, geometry, padding) and substitution variables
directly from the UI; commits write back to the original YAML preserving
comments and formatting.

## Install & run

```sh
# in any folder containing ESPHome *.yaml configs:
npx esphome-lvgl-editor

# or against a specific path:
npx esphome-lvgl-editor ./path/to/esphome

# try the bundled cookbook samples without your own config:
npx esphome-lvgl-editor --demo
```

Then open <http://127.0.0.1:5371> in a browser. Pick a config from the
sidebar and explore its pages.

### CLI options

```
Usage: esphome-lvgl-editor [path] [options]

Arguments:
  path              Directory containing top-level *.yaml ESPHome configs (default: cwd)

Options:
  -p, --port <n>    HTTP port (default: 5371; tries next free if taken)
      --host <h>    Bind host (default: 127.0.0.1)
      --demo        Use the bundled samples/ directory instead of [path]
      --open        Open the browser on start
  -h, --help        Show this help and exit
  -v, --version     Show version and exit
```

## What it renders

Today: `obj`, `button`, `image`, `label`, `slider`, `spinner`, with FLEX and
GRID layouts, alignment, padding, styles, fonts, multi-page navigation, and
substitution variables. Anything else falls back to a placeholder box.

The full list of widgets and features still to support before the editor can
draw the entire [ESPHome LVGL cookbook](https://esphome.io/cookbook/lvgl/) is
in [samples/README.md](samples/README.md).

## How edits work

1. Click a widget in the canvas — its origin (file + YAML path) shows in the
   side panel.
2. Change a property; the edit is staged in memory.
3. Click **Commit** — the file is rewritten with comments and indentation
   preserved (round-trip via [`eemeli/yaml`](https://github.com/eemeli/yaml)).
4. If the value came from a `${variable}`, the editor updates the
   substitution definition instead, with a "used by N widgets" confirmation.

External edits to the same files (your IDE, `git pull`, etc.) are picked up
live via SSE and refresh the preview without a page reload.

## Develop

```sh
git clone https://github.com/ghidosoft/esphome-lvgl-editor
cd esphome-lvgl-editor
npm install
npm run dev      # Vite dev server with HMR
npm run build    # production bundle (client + CLI server)
npm run lint
```

The dev server reads from `../home-assistant/esphome` by default — adjust
[`vite.config.ts`](vite.config.ts) to point at your own ESPHome project
folder, or run the built CLI on it instead.

### Architecture

- **Frontend** — React 19 SPA in [src/client/](src/client/) calling
  `/__lvgl/*` endpoints; rendering done by an isomorphic Canvas 2D renderer
  in [src/renderer/](src/renderer/).
- **Parser** — [src/parser/](src/parser/) loads, merges packages, applies
  substitutions, and tracks per-leaf origin (file + YAML path) for
  round-trip edits.
- **Server** — [src/server/lvglRouter.ts](src/server/lvglRouter.ts) is a
  framework-agnostic router with five endpoints: `/__lvgl/projects`,
  `/__lvgl/project/:name`, `/__lvgl/edit`, `/__lvgl/commit`, and the SSE
  stream `/__lvgl/events`. It runs both inside the Vite dev plugin
  ([src/server/plugin.ts](src/server/plugin.ts)) and behind the standalone
  CLI ([bin/cli.mjs](bin/cli.mjs)).

## Status

Early. Visual editing is functional, but the widget set is small and the
roadmap (see [TODO.md](TODO.md) and [samples/README.md](samples/README.md))
is still long. Issues and PRs welcome.

## License

[MIT](LICENSE) © Andrea Ghidini
