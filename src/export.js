/** Multiplier applied to Graphviz's point dimensions when rasterizing to PNG. */
const PNG_SCALE = 2;

/**
 * Wires up the footer's export buttons.
 *
 * getSvgSource() returns the SVG string of the last successful render (null if
 * nothing has rendered yet); getDotSource() returns the editor's current text.
 */
export function registerExportButtons({ root, status, getSvgSource, getDotSource }) {
    const handlers = {
        svg: exportSvg,
        png: exportPng,
        dot: exportDot,
        copy: copySvg,
    };

    root.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-export]");
        if (!button) return;

        const handler = handlers[button.dataset.export];
        if (!handler) return;

        button.disabled = true;
        try {
            setStatus(await handler());
        } catch (err) {
            console.error("Export failed:", err);
            setStatus(`Export failed: ${err.message}`, true);
        } finally {
            button.disabled = false;
        }
    });

    function exportSvg() {
        const svg = requireSvg();
        const name = `${baseFilename(getDotSource())}.svg`;
        downloadBlob(new Blob([svg], { type: "image/svg+xml" }), name);
        return `Saved ${name}`;
    }

    async function exportPng() {
        const svg = requireSvg();
        const name = `${baseFilename(getDotSource())}.png`;
        downloadBlob(await rasterize(svg, PNG_SCALE), name);
        return `Saved ${name}`;
    }

    function exportDot() {
        const name = `${baseFilename(getDotSource())}.dot`;
        downloadBlob(new Blob([getDotSource()], { type: "text/vnd.graphviz" }), name);
        return `Saved ${name}`;
    }

    async function copySvg() {
        await navigator.clipboard.writeText(requireSvg());
        return "SVG copied to clipboard";
    }

    function requireSvg() {
        const svg = getSvgSource();
        if (!svg) throw new Error("nothing rendered yet");
        return svg;
    }

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle("status--error", isError);
    }
}

/**
 * Draws the SVG onto a canvas and returns a PNG blob.
 *
 * The canvas is left unpainted so a graph with bgcolor=transparent stays
 * transparent; Graphviz's default white background polygon is part of the SVG.
 */
async function rasterize(svgSource, scale) {
    const { width, height } = intrinsicSize(svgSource);
    const url = URL.createObjectURL(
        new Blob([svgSource], { type: "image/svg+xml;charset=utf-8" })
    );

    try {
        const image = await loadImage(url);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

        return await new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error("canvas is empty")),
                "image/png"
            );
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("could not rasterize SVG"));
        image.src = url;
    });
}

/** Reads the graph's size from the SVG viewBox, in Graphviz points. */
function intrinsicSize(svgSource) {
    const match = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/.exec(svgSource);
    if (!match) return { width: 800, height: 600 };
    return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
}

/** Uses the graph's own name for the download, e.g. `digraph pipeline {` -> pipeline. */
function baseFilename(dotSource) {
    const match = /\b(?:strict\s+)?(?:di)?graph\s+(?:"([^"]+)"|([A-Za-z_][\w]*))/.exec(dotSource);
    const name = match ? (match[1] ?? match[2]) : "graph";
    return name.replace(/[^\w.-]+/g, "_") || "graph";
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
