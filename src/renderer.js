/** A layout taking longer than this is assumed to be pathological and killed. */
const RENDER_TIMEOUT_MS = 5000;

/** Renders faster than this finish before anyone notices; no need to flag them. */
const BUSY_AFTER_MS = 300;

/**
 * Owns the graph pane and a worker thread running Graphviz.
 *
 * Layout runs off the main thread, so typing stays responsive no matter how
 * long a graph takes. It also means a runaway layout can be aborted, which is
 * impossible when the render blocks the main thread.
 *
 * Keeps the SVG source string of the last successful render for exports; the
 * displayed element has had its width/height stripped for responsive display.
 */
export function createRenderer({ stage, diagnostics, onBusy = () => {} }) {
    let worker;
    let pending = null;
    let nextId = 0;
    let lastSvgSource = null;

    startWorker();

    function startWorker() {
        worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

        worker.onmessage = ({ data }) => {
            // A superseded render can still land; ignore anything but the newest.
            if (!pending || data.id !== pending.id) return;
            settle();

            if (!data.ok) {
                showDiagnostics([{ level: "error", message: data.message }]);
                return;
            }

            showDiagnostics(data.result.errors);

            // On failure, leave the previous graph up rather than blanking the
            // pane over a typo mid-edit.
            if (data.result.status !== "success") return;

            lastSvgSource = data.result.output;
            stage.replaceChildren(toResponsiveElement(data.result.output));
        };

        worker.onerror = (event) => {
            event.preventDefault();
            settle();
            showDiagnostics([{ level: "error", message: `Renderer failed: ${event.message}` }]);
        };
    }

    function restartWorker() {
        worker.terminate();
        settle();
        startWorker();
    }

    /** Clears the timers for the in-flight render and drops the busy state. */
    function settle() {
        if (!pending) return;
        clearTimeout(pending.timeoutTimer);
        clearTimeout(pending.busyTimer);
        pending = null;
        onBusy(false);
    }

    function render(dot) {
        // The worker handles one message at a time, so a slow layout already in
        // progress would delay this one. Kill it: its result is stale anyway.
        if (pending) restartWorker();

        const id = ++nextId;
        pending = {
            id,
            busyTimer: setTimeout(() => onBusy(true), BUSY_AFTER_MS),
            timeoutTimer: setTimeout(() => {
                restartWorker();
                showDiagnostics([{
                    level: "error",
                    message: `Layout timed out after ${RENDER_TIMEOUT_MS / 1000}s. `
                        + `This graph may have too many edge crossings to lay out.`,
                }]);
            }, RENDER_TIMEOUT_MS),
        };

        worker.postMessage({ id, dot });
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
