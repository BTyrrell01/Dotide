import { parseEdgeTitle } from "./source-map.js";

/** Ignore marquees smaller than this; they are almost certainly a stray drag. */
const MIN_MARQUEE_PX = 4;

/**
 * Turns picks in the rendered graph into the <title> strings Graphviz wrote,
 * which name the nodes and edges in the DOT source.
 *
 * Hit-testing uses client rectangles, so it is unaffected by the pan/zoom
 * transform on the stage.
 */
export function createGraphSelection({ viewport, stage, onSelect }) {
    let selected = new Set();

    const marquee = document.createElement("div");
    marquee.className = "marquee";
    marquee.hidden = true;
    viewport.appendChild(marquee);

    function titleOf(element) {
        const group = element?.closest?.("g.node, g.edge");
        return group?.querySelector("title")?.textContent ?? null;
    }

    const intersects = (box, rect) =>
        box.right >= rect.left && box.left <= rect.right
        && box.bottom >= rect.top && box.top <= rect.bottom;

    /**
     * Nodes whose box meets the rectangle, plus edges running between two of
     * them.
     *
     * An edge's bounding box spans its whole curve, so testing edges by
     * intersection pulls in anything merely passing nearby: dragging a box
     * around one cluster would select edges leaving it. Requiring both
     * endpoints keeps the selection to what the box actually encloses.
     */
    function titlesWithin(rect) {
        const nodes = new Set();

        for (const group of stage.querySelectorAll("g.node")) {
            if (!intersects(group.getBoundingClientRect(), rect)) continue;
            const title = group.querySelector("title")?.textContent;
            if (title) nodes.add(title);
        }

        const edges = [];
        for (const group of stage.querySelectorAll("g.edge")) {
            const title = group.querySelector("title")?.textContent;
            const ends = title ? parseEdgeTitle(title) : null;
            if (ends && nodes.has(ends.tail) && nodes.has(ends.head)) edges.push(title);
        }

        return [...nodes, ...edges];
    }

    /**
     * Marks the selected shapes in the SVG.
     *
     * Graphviz writes fill and stroke as presentation attributes, which any CSS
     * rule outranks, so the styling lives in the stylesheet rather than being
     * written onto the elements here.
     */
    function paint() {
        for (const group of stage.querySelectorAll("g.node, g.edge")) {
            const title = group.querySelector("title")?.textContent;
            group.classList.toggle("is-selected", Boolean(title) && selected.has(title));
        }
    }

    function select(titles) {
        selected = new Set(titles);
        paint();
        onSelect([...selected]);
    }

    function showMarquee(rect) {
        const bounds = viewport.getBoundingClientRect();
        marquee.style.left = `${rect.left - bounds.left}px`;
        marquee.style.top = `${rect.top - bounds.top}px`;
        marquee.style.width = `${rect.right - rect.left}px`;
        marquee.style.height = `${rect.bottom - rect.top}px`;
        marquee.hidden = false;
    }

    return {
        /** A plain click: select what is under it, or clear on empty space. */
        pick(element) {
            const title = titleOf(element);
            select(title ? [title] : []);
        },

        marqueeMove(rect) {
            showMarquee(rect);
        },

        marqueeEnd(rect) {
            marquee.hidden = true;

            if (rect.right - rect.left < MIN_MARQUEE_PX && rect.bottom - rect.top < MIN_MARQUEE_PX) {
                return;
            }

            select(titlesWithin(rect));
        },

        cancelMarquee() {
            marquee.hidden = true;
        },

        /**
         * Re-marks the selection after a re-render, which replaces the SVG
         * wholesale. Switching layout engine redraws the same graph, so the
         * selection should survive it.
         */
        repaint() {
            paint();
        },

        clear() {
            select([]);
        },
    };
}
