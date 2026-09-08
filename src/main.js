import { createEditor } from "./editor.js";
import { createRenderer } from "./renderer.js";
import { registerExportButtons } from "./export.js";
import { createPanZoom } from "./panzoom.js";
import { loadDocument, saveDocument } from "./storage.js";

const INITIAL_DOC = "digraph {\n    a -> b\n}\n";
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

    createPanZoom({
        viewport: document.querySelector("#graph"),
        stage: document.querySelector("#stage"),
        controls: document.querySelector("#zoom-controls"),
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
