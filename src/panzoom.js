const MIN_SCALE = 0.1;
const MAX_SCALE = 20;

/** Zoom factor applied per click of the + / - buttons. */
const BUTTON_STEP = 1.25;

/** Wheel sensitivity, in zoom exponent per pixel of scroll. */
const WHEEL_SENSITIVITY = 0.0015;

/** Firefox reports wheel deltas in lines rather than pixels. */
const LINE_HEIGHT_PX = 16;

/** Below this much movement a drag counts as a click rather than a pan. */
const CLICK_SLOP_PX = 4;

/**
 * Pans and zooms the graph by transforming `stage`, leaving the rendered SVG
 * untouched so exports are unaffected by the current view.
 *
 * The transform survives re-renders: while you iterate on a graph, the view
 * stays where you put it. `reset` (the home button) returns to the fitted view.
 */
export function createPanZoom({ viewport, stage, controls, selection = null }) {
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

    let drag = null;

    const rectBetween = (a, b) => ({
        left: Math.min(a.x, b.x),
        top: Math.min(a.y, b.y),
        right: Math.max(a.x, b.x),
        bottom: Math.max(a.y, b.y),
    });

    viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;

        drag = {
            start: { x: event.clientX, y: event.clientY },
            last: { x: event.clientX, y: event.clientY },
            moved: 0,
            // Shift selects; a plain drag still pans. The target is recorded
            // here because setPointerCapture redirects later events to the
            // viewport, so by pointerup the graph element is no longer the
            // target.
            marquee: event.shiftKey && Boolean(selection),
            target: event.target,
        };

        // Shift-drag is a browser text-selection gesture; suppress it.
        if (drag.marquee) event.preventDefault();

        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add(drag.marquee ? "is-selecting" : "is-panning");
    });

    viewport.addEventListener("pointermove", (event) => {
        if (!drag) return;

        const point = { x: event.clientX, y: event.clientY };
        drag.moved += Math.hypot(point.x - drag.last.x, point.y - drag.last.y);

        if (drag.marquee) {
            selection.marqueeMove(rectBetween(drag.start, point));
        } else {
            x += point.x - drag.last.x;
            y += point.y - drag.last.y;
            apply();
        }

        drag.last = point;
    });

    viewport.addEventListener("pointerup", (event) => {
        if (!drag) return;
        const finished = drag;
        drag = null;

        viewport.releasePointerCapture(event.pointerId);
        viewport.classList.remove("is-panning", "is-selecting");

        if (finished.marquee) {
            selection.marqueeEnd(rectBetween(finished.start, { x: event.clientX, y: event.clientY }));
        } else if (selection && finished.moved < CLICK_SLOP_PX) {
            selection.pick(finished.target);
        }
    });

    viewport.addEventListener("pointercancel", (event) => {
        if (!drag) return;
        if (drag.marquee) selection.cancelMarquee();
        drag = null;
        viewport.releasePointerCapture(event.pointerId);
        viewport.classList.remove("is-panning", "is-selecting");
    });

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

    return { reset };
}
