# DOT IDE

Browser-based [DOT language](https://graphviz.org/doc/info/lang.html) editor and
visualizer. DOT source on the left, live Graphviz render on the right.

## Running

```sh
npm install
npm run dev     # build, watch, and serve on http://localhost:10001
npm run build   # one-off build into dist/
```

## Layout

| Path | |
| --- | --- |
| `public/` | Hand-written static assets, copied into `dist/` by the build |
| `src/main.js` | Entry point; wires the modules below together |
| `src/editor.js` | CodeMirror setup |
| `src/renderer.js` | Drives the render worker; owns the graph pane and error reporting |
| `src/worker.js` | Worker thread running Graphviz (WASM) |
| `src/panzoom.js` | Pan, zoom, and the view controls |
| `src/storage.js` | Document persistence via localStorage |
| `src/export.js` | SVG / PNG / DOT export buttons |

`dist/` is build output and is not checked in.

## Notes

Graph layout runs on a worker thread, so typing stays responsive regardless of
how long a graph takes to lay out. Layout cost is driven by edge crossings
rather than node count: a 1000-node tree lays out in ~80ms, while 200 nodes
wired densely can take tens of seconds. A layout exceeding 5s is aborted and
reported, which is only possible because it is off the main thread.

The editor document is saved to localStorage on every (debounced) change and
restored on load. Pan/zoom transforms the container, not the SVG, so exports
are unaffected by the current view.
