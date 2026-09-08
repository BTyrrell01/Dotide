const MIN_SCALE = 0.1;
const MAX_SCALE = 20;

/** Zoom factor applied per click of the + / - buttons. */
const BUTTON_STEP = 1.25;

/** Wheel sensitivity, in zoom exponent per pixel of scroll. */
const WHEEL_SENSITIVITY = 0.0015;

/** Firefox reports wheel deltas in lines rather than pixels. */
const LINE_HEIGHT_PX = 16;

/**
 * Pans and zooms the graph by transforming `stage`, leaving the rendered SVG
 * untouched so exports are unaffected by the current view.
 *
 * The transform survives re-renders: while you iterate on a graph, the view
 * stays where you put it. `reset` (the home button) returns to the fitted view.
 */
export function createPanZoom({ viewport, stage, controls }) {
    let scale = 1;
    let x = 0;
    let y = 0;

    function apply() {
        stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }

    /** Zooms about a screen point, keeping whatever is under it in place. */
    function zoomAt(clientX, clientY, factor) {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
        if (next === scale) return;

        const rect = viewport.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;

        // Solve for the translation that leaves (px, py) over the same point of
        // the stage after scaling. transform-origin is the stage's top-left.
        x = px - ((px - x) * next) / scale;
        y = py - ((py - y) * next) / scale;
        scale = next;
        apply();
    }

    function zoomCenter(factor) {
        const rect = viewport.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    }

    function reset() {
        scale = 1;
        x = 0;
        y = 0;
        apply();
    }

    viewport.addEventListener("wheel", (event) => {
        // Without this the page scrolls instead of zooming. Trackpad pinch
        // arrives here too, as a wheel event with ctrlKey set.
        event.preventDefault();

        const delta = event.deltaMode === 1 ? event.deltaY * LINE_HEIGHT_PX : event.deltaY;
        zoomAt(event.clientX, event.clientY, Math.exp(-delta * WHEEL_SENSITIVITY));
    }, { passive: false });

    let dragOrigin = null;

    viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        dragOrigin = { x: event.clientX, y: event.clientY };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("is-panning");
    });

    viewport.addEventListener("pointermove", (event) => {
        if (!dragOrigin) return;
        x += event.clientX - dragOrigin.x;
        y += event.clientY - dragOrigin.y;
        dragOrigin = { x: event.clientX, y: event.clientY };
        apply();
    });

    for (const type of ["pointerup", "pointercancel"]) {
        viewport.addEventListener(type, (event) => {
            if (!dragOrigin) return;
            dragOrigin = null;
            viewport.releasePointerCapture(event.pointerId);
            viewport.classList.remove("is-panning");
        });
    }

    const actions = {
        in: () => zoomCenter(BUTTON_STEP),
        out: () => zoomCenter(1 / BUTTON_STEP),
        home: reset,
    };

    controls.addEventListener("click", (event) => {
        const button = event.target.closest("[data-zoom]");
        if (button) actions[button.dataset.zoom]?.();
    });

    apply();

    return { reset, ...actions };
}
