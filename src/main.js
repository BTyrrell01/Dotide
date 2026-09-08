import { createEditor } from "./editor.js";
import { createRenderer } from "./renderer.js";
import { registerExportButtons } from "./export.js";

const INITIAL_DOC = "digraph {\n    a -> b\n}\n";
const RENDER_DEBOUNCE_MS = 200;

async function main() {
    const renderer = await createRenderer({
        viewport: document.querySelector("#graph"),
        diagnostics: document.querySelector("#diagnostics"),
    });

    let renderTimeout;
    const editor = createEditor({
        parent: document.querySelector("#editor"),
        doc: INITIAL_DOC,
        onChange(text) {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => renderer.render(text), RENDER_DEBOUNCE_MS);
        },
    });

    registerExportButtons({
        root: document.querySelector("#exports"),
        status: document.querySelector("#status"),
        getSvgSource: renderer.getSvgSource,
        getDotSource: editor.getSource,
    });

    renderer.render(INITIAL_DOC);
}

main().catch((err) => {
    console.error("Failed to start:", err);
    document.querySelector("#diagnostics").textContent = `Failed to start: ${err.message}`;
    document.querySelector("#diagnostics").hidden = false;
});
