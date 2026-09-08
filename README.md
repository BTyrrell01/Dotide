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
| `src/main.js` | Entry point; wires the editor, renderer, and exports together |
| `src/editor.js` | CodeMirror setup |
| `src/renderer.js` | Graphviz (WASM) rendering and error reporting |
| `src/export.js` | SVG / PNG / DOT export buttons |

`dist/` is build output and is not checked in.
