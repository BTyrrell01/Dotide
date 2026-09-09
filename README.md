# DOT IDE

Browser-based [DOT language](https://graphviz.org/doc/info/lang.html) editor and
visualizer. DOT source on the left, live Graphviz render on the right.

## Running

```sh
npm install
npm run dev     # build, watch, and serve on http://localhost:10001
npm run build   # one-off build into dist/
npm test        # build, then drive the app in a real browser
```

`npm test` builds into `dist-test/`, serves it on an ephemeral port, and runs
each suite in `test/` against a headless Chrome, so it never disturbs a running
dev server. Pass names to narrow it: `npm test -- engine completion`. Set
`CHROME_PATH` if Chrome is not in a standard location.

`OUT_DIR` and `PORT` override the output directory and dev-server port, so a
second instance can run without disturbing one already using `dist/` and 10001:

```sh
OUT_DIR=dist-check PORT=10099 npm run dev
```

This matters because `npm run build` clears its output directory first: a build
using the default `dist/` will delete the files a running dev server is serving.
`dist-*/` is gitignored, so any alternate output directory named that way stays
out of the repo. `OUT_DIR` must point inside the project — the build refuses
anything else, since it names a directory that gets recursively deleted.

## Layout

| Path | |
| --- | --- |
| `public/` | Hand-written static assets, copied into `dist/` by the build |
| `test/` | Browser tests; one suite per concern, run by `test/run.mjs` |
| `src/main.js` | Entry point; wires the modules below together |
| `src/editor.js` | CodeMirror setup |
| `src/renderer.js` | Drives the render worker; owns the graph pane and error reporting |
| `src/worker.js` | Worker thread running Graphviz (WASM) |
| `src/panzoom.js` | Pan, zoom, and the view controls |
| `src/selection.js` | Click and shift-drag selection in the graph |
| `src/source-map.js` | Maps graph nodes and edges back to source ranges |
| `src/storage.js` | Document, engine and theme persistence via localStorage |
| `src/theme.js` | Light / dark / system theme resolution |
| `src/completion.js` | Context-aware DOT completion |
| `src/default-graph.js` | The document new visitors see, and what reset restores |
| `src/export.js` | SVG / PNG / DOT export buttons |

`dist/` is build output and is not checked in.

## Selecting

Clicking a node or edge highlights every occurrence of it in the source. Shift-
drag draws a selection box; plain drag still pans. A box selects the nodes it
touches, plus edges running between two of them — an edge's bounding box spans
its whole curve, so testing edges by intersection alone would pull in anything
passing nearby.

## Notes

Graph layout runs on a worker thread, so typing stays responsive regardless of
how long a graph takes to lay out. Layout cost is driven by edge crossings
rather than node count: a 1000-node tree lays out in ~80ms, while 200 nodes
wired densely can take tens of seconds. A layout exceeding 5s is aborted and
reported, which is only possible because it is off the main thread.

The editor document is saved to localStorage on every (debounced) change and
restored on load. Pan/zoom transforms the container, not the SVG, so exports
are unaffected by the current view.
