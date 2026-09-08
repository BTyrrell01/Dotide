import { createEditor } from "./editor.js";
import { createRenderer } from "./renderer.js";
import { registerExportButtons } from "./export.js";
import { createPanZoom } from "./panzoom.js";
import { loadDocument, saveDocument } from "./storage.js";

const INITIAL_DOC = `digraph G {

  subgraph cluster_0 {
    style=filled;
    color=lightgrey;
    node [style=filled,color=white];
    a0 -> a1 -> a2 -> a3;
    label = "process #1";
  }

  subgraph cluster_1 {
    node [style=filled];
    b0 -> b1 -> b2 -> b3;
    label = "process #2";
    color=blue
  }
  start -> a0;
  start -> b0;
  a1 -> b3;
  b2 -> a3;
  a3 -> a0;
  a3 -> end;
  b3 -> end;

  start [shape=diamond];
  end [shape=Msquare];
}
`;

const DEBOUNCE_MS = 200;

function main() {
    const busy = document.querySelector("#busy");

    const renderer = createRenderer({
        stage: document.querySelector("#stage"),
        diagnostics: document.querySelector("#diagnostics"),
        onBusy: (isBusy) => { busy.hidden = !isBusy; },
    });

    const doc = loadDocument(INITIAL_DOC);
    let debounce;

    const editor = createEditor({
        parent: document.querySelector("#editor"),
        doc,
        onChange(text) {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                renderer.render(text);
                saveDocument(text);
            }, DEBOUNCE_MS);
        },
    });

    // The debounce can swallow the last few keystrokes before the tab closes.
    window.addEventListener("beforeunload", () => saveDocument(editor.getSource()));

    const panZoom = createPanZoom({
        viewport: document.querySelector("#graph"),
        stage: document.querySelector("#stage"),
        controls: document.querySelector("#zoom-controls"),
    });

    document.querySelector("#reset").addEventListener("click", () => {
        if (!confirm("Replace the current document with the default graph?")) return;

        // A normal edit: onChange renders and saves it, and undo restores the
        // previous document.
        editor.setSource(INITIAL_DOC);
        panZoom.reset();
    });

    registerExportButtons({
        root: document.querySelector("#exports"),
        status: document.querySelector("#status"),
        getSvgSource: renderer.getSvgSource,
        getDotSource: editor.getSource,
    });

    renderer.render(doc);
}

try {
    main();
} catch (err) {
    // Worker construction and DOM lookups happen synchronously here; a failure
    // would otherwise leave a blank page with only a console message.
    console.error("Failed to start:", err);
    const diagnostics = document.querySelector("#diagnostics");
    diagnostics.className = "diagnostics diagnostics--error";
    diagnostics.textContent = `Failed to start: ${err.message}`;
    diagnostics.hidden = false;
}
