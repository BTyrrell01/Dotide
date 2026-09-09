import { syntaxTree } from "@codemirror/language";

/**
 * Maps things picked in the rendered graph back to ranges in the DOT source.
 *
 * Graphviz stamps every shape with a <title> holding its DOT name, and the
 * lang-dot parser knows where each name sits, so no text searching is needed.
 */

/** The text of a Node, and whether it was written quoted. */
function nodeName(state, node) {
    const plain = node.getChild("Name");
    if (plain) return { text: state.sliceDoc(plain.from, plain.to), from: plain.from, to: plain.to };

    const quoted = node.getChild("String");
    if (!quoted) return null;

    const raw = state.sliceDoc(quoted.from, quoted.to);
    // Graphviz reports the name without its quotes, so compare against that.
    return { text: raw.slice(1, -1), from: quoted.from, to: quoted.to };
}

/** Every Node in the document, in source order. */
function allNodes(state) {
    const found = [];
    syntaxTree(state).iterate({
        enter(ref) {
            if (ref.name !== "Node") return;
            const name = nodeName(state, ref.node);
            if (name) found.push({ ...name, statement: ref.node.parent });
        },
    });
    return found;
}

/** Ranges of every occurrence of a node name. */
export function nodeRanges(state, name) {
    return allNodes(state)
        .filter((node) => node.text === name)
        .map(({ from, to }) => ({ from, to }));
}

/**
 * Ranges covering `tail -> head`.
 *
 * `a0 -> a1 -> a2` is a single EdgeStatement, so this looks for adjacent node
 * pairs within one statement rather than highlighting the whole chain.
 */
export function edgeRanges(state, tail, head) {
    const ranges = [];
    const nodes = allNodes(state);

    for (let i = 0; i < nodes.length - 1; i++) {
        const left = nodes[i];
        const right = nodes[i + 1];

        if (left.statement !== right.statement) continue;
        if (left.statement?.name !== "EdgeStatement") continue;
        if (left.text !== tail || right.text !== head) continue;

        ranges.push({ from: left.from, to: right.to });
    }

    return ranges;
}

/** Splits an edge title such as "a0->a1" or "a -- b" into its endpoints. */
export function parseEdgeTitle(title) {
    const match = /^(.*?)\s*(?:->|--)\s*(.*)$/.exec(title);
    return match ? { tail: match[1], head: match[2] } : null;
}

/**
 * Ranges for a set of picks, merged and sorted. Picks are the <title> strings
 * Graphviz emitted, so an edge title is turned back into its endpoints here.
 */
export function rangesForTitles(state, titles) {
    const ranges = [];

    for (const title of titles) {
        const edge = parseEdgeTitle(title);
        if (edge) {
            ranges.push(...edgeRanges(state, edge.tail, edge.head));
        } else {
            ranges.push(...nodeRanges(state, title));
        }
    }

    // Overlapping ranges would make an invalid decoration set.
    ranges.sort((a, b) => a.from - b.from || a.to - b.to);

    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
        else merged.push({ ...range });
    }

    return merged;
}
