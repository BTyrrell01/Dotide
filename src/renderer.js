import { instance } from "@viz-js/viz";

/**
 * Wraps a Viz (Graphviz/WASM) instance and owns the graph pane.
 *
 * Keeps the SVG source string of the last successful render around so exports
 * work from Graphviz's own output rather than re-serializing the live DOM node,
 * which has had its width/height stripped for responsive display.
 */
export async function createRenderer({ viewport, diagnostics }) {
    const viz = await instance();

    let lastSvgSource = null;
    const listeners = new Set();

    function render(dot) {
        let result;

        try {
            // render() reports bad DOT via result.errors; only unexpected
            // runtime failures throw.
            result = viz.render(dot, { format: "svg" });
        } catch (err) {
            showDiagnostics([{ level: "error", message: String(err) }]);
            return;
        }

        if (result.status !== "success") {
            // Leave the previous graph on screen so a typo mid-edit doesn't
            // blank the pane.
            showDiagnostics(result.errors);
            return;
        }

        showDiagnostics(result.errors);
        lastSvgSource = result.output;
        viewport.replaceChildren(toResponsiveElement(result.output));
        listeners.forEach((fn) => fn(lastSvgSource));
    }

    function showDiagnostics(errors = []) {
        if (errors.length === 0) {
            diagnostics.hidden = true;
            diagnostics.textContent = "";
            return;
        }

        const hasError = errors.some((e) => e.level === "error");
        diagnostics.className = `diagnostics diagnostics--${hasError ? "error" : "warning"}`;
        diagnostics.textContent = errors.map((e) => e.message).join("\n");
        diagnostics.hidden = false;
    }

    return {
        render,
        getSvgSource: () => lastSvgSource,
        onRender(fn) { listeners.add(fn); },
    };
}

/** Parses Graphviz SVG output and sizes it to fill its container. */
function toResponsiveElement(svgSource) {
    const svg = new DOMParser()
        .parseFromString(svgSource, "image/svg+xml")
        .documentElement;

    // Graphviz emits absolute pt dimensions; drop them and let the viewBox plus
    // CSS drive the size.
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    return svg;
}
