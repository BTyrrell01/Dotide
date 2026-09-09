import { createEditor } from "./editor.js";
import { createRenderer } from "./renderer.js";
import { registerExportButtons } from "./export.js";
import { createPanZoom } from "./panzoom.js";
import { loadDocument, saveDocument, loadEngine, saveEngine, loadTheme, saveTheme } from "./storage.js";
import { DEFAULT_GRAPH } from "./default-graph.js";
import { createTheme, resolveTheme, DEFAULT_THEME } from "./theme.js";

const DEBOUNCE_MS = 200;
const DEFAULT_ENGINE = "dot";

/** A stored value could name an option this build no longer offers. */
function knownOption(select, value, fallback) {
    return [...select.options].some((option) => option.value === value) ? value : fallback;
}

function main() {
    const busy = document.querySelector("#busy");

    const renderer = createRenderer({
        stage: document.querySelector("#stage"),
        diagnostics: document.querySelector("#diagnostics"),
        onBusy: (isBusy) => { busy.hidden = !isBusy; },
    });

    const engineSelect = document.querySelector("#engine");
    engineSelect.value = knownOption(engineSelect, loadEngine(DEFAULT_ENGINE), DEFAULT_ENGINE);

    const themeSelect = document.querySelector("#theme");
    themeSelect.value = knownOption(themeSelect, loadTheme(DEFAULT_THEME), DEFAULT_THEME);

    const doc = loadDocument(DEFAULT_GRAPH);
    let debounce;

    const editor = createEditor({
        parent: document.querySelector("#editor"),
        doc,
        theme: resolveTheme(themeSelect.value),
        onChange(text) {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                renderer.render(text, engineSelect.value);
                saveDocument(text);
            }, DEBOUNCE_MS);
        },
    });

    const theme = createTheme({ onResolved: (resolved) => editor.setTheme(resolved) });
    theme.set(themeSelect.value);

    themeSelect.addEventListener("change", () => {
        saveTheme(themeSelect.value);
        theme.set(themeSelect.value);
    });

    engineSelect.addEventListener("change", () => {
        saveEngine(engineSelect.value);
        renderer.render(editor.getSource(), engineSelect.value);
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
        editor.setSource(DEFAULT_GRAPH);
        panZoom.reset();
    });

    registerExportButtons({
        root: document.querySelector("#exports"),
        status: document.querySelector("#status"),
        getSvgSource: renderer.getSvgSource,
        getDotSource: editor.getSource,
    });

    renderer.render(doc, engineSelect.value);
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
