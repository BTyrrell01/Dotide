import { syntaxTree } from "@codemirror/language";

/**
 * Context-aware completion for DOT.
 *
 * `@viz-js/lang-dot` ships a parser but no completion data, so autocompletion()
 * has nothing to offer without this. The grammar names the nodes we need
 * (Attributes, AttributeStatement, EdgeStatement, SimpleStatement), which is
 * enough to tell a node attribute list from an edge one.
 */

const KEYWORDS = ["graph", "digraph", "subgraph", "strict", "node", "edge"];

const GRAPH_ATTRIBUTES = [
    "bgcolor", "center", "clusterrank", "color", "colorscheme", "comment",
    "compound", "concentrate", "fillcolor", "fontcolor", "fontname", "fontsize",
    "label", "labeljust", "labelloc", "layout", "margin", "newrank", "nodesep",
    "nojustify", "ordering", "orientation", "outputorder", "overlap", "pad",
    "pagedir", "penwidth", "rank", "rankdir", "ranksep", "ratio", "rotate",
    "size", "splines", "style", "tooltip", "URL",
];

const NODE_ATTRIBUTES = [
    "color", "colorscheme", "comment", "distortion", "fillcolor", "fixedsize",
    "fontcolor", "fontname", "fontsize", "group", "height", "image",
    "imagescale", "label", "labelloc", "margin", "nojustify", "orientation",
    "penwidth", "peripheries", "pos", "regular", "shape", "sides", "skew",
    "style", "target", "tooltip", "URL", "width", "xlabel",
];

const EDGE_ATTRIBUTES = [
    "arrowhead", "arrowsize", "arrowtail", "color", "colorscheme", "comment",
    "constraint", "decorate", "dir", "fontcolor", "fontname", "fontsize",
    "headclip", "headlabel", "headport", "label", "labelangle", "labeldistance",
    "labelfloat", "labelfontcolor", "len", "lhead", "ltail", "minlen",
    "penwidth", "samehead", "sametail", "style", "tailclip", "taillabel",
    "tailport", "target", "tooltip", "URL", "weight", "xlabel",
];

const COLORS = [
    "black", "white", "transparent", "none", "gray", "grey", "lightgrey",
    "lightgray", "darkgray", "red", "green", "blue", "yellow", "orange",
    "purple", "brown", "pink", "cyan", "magenta", "salmon", "lightblue",
    "lightgreen", "lightyellow", "navy", "teal", "olive", "maroon", "gold",
    "silver", "crimson", "coral", "khaki", "lavender", "plum", "tan",
    "turquoise", "violet", "wheat",
];

const COLOR_ATTRIBUTES = new Set([
    "color", "fillcolor", "bgcolor", "fontcolor", "pencolor", "labelfontcolor",
]);

const BOOLEANS = ["true", "false"];

/** Enumerated values, by attribute. `style` is handled separately per context. */
const VALUES = {
    shape: [
        "box", "polygon", "ellipse", "oval", "circle", "point", "egg",
        "triangle", "plaintext", "plain", "diamond", "trapezium",
        "parallelogram", "house", "pentagon", "hexagon", "septagon", "octagon",
        "doublecircle", "doubleoctagon", "tripleoctagon", "invtriangle",
        "invtrapezium", "invhouse", "Mdiamond", "Msquare", "Mcircle", "rect",
        "rectangle", "square", "star", "none", "underline", "cylinder", "note",
        "tab", "folder", "box3d", "component", "record", "Mrecord",
    ],
    rankdir: ["TB", "LR", "BT", "RL"],
    dir: ["forward", "back", "both", "none"],
    arrowhead: [
        "normal", "inv", "dot", "odot", "invdot", "invodot", "none", "tee",
        "empty", "invempty", "diamond", "odiamond", "ediamond", "crow", "box",
        "obox", "open", "halfopen", "vee",
    ],
    splines: ["none", "line", "polyline", "curved", "ortho", "spline", "true", "false"],
    overlap: ["true", "false", "scale", "prism", "compress", "vpsc", "ortho"],
    labelloc: ["t", "b", "c"],
    labeljust: ["l", "r", "c"],
    ratio: ["fill", "compress", "expand", "auto"],
    fixedsize: ["true", "false", "shape"],
    ordering: ["in", "out"],
    outputorder: ["breadthfirst", "nodesfirst", "edgesfirst"],
    clusterrank: ["local", "global", "none"],
    rank: ["same", "min", "source", "max", "sink"],
    layout: ["dot", "neato", "fdp", "sfdp", "circo", "twopi", "osage", "patchwork"],
    imagescale: ["true", "false", "width", "height", "both"],
    pagedir: ["BL", "BR", "TL", "TR", "RB", "RT", "LB", "LT"],
};

VALUES.arrowtail = VALUES.arrowhead;

/** Attributes that take true/false. */
const BOOLEAN_ATTRIBUTES = new Set([
    "constraint", "decorate", "compound", "concentrate", "center", "newrank",
    "nojustify", "regular", "labelfloat", "headclip", "tailclip",
]);

const STYLES = {
    node: ["filled", "invisible", "diagonals", "rounded", "dashed", "dotted",
           "solid", "bold", "wedged", "striped", "radial"],
    edge: ["solid", "dashed", "dotted", "bold", "invis", "tapered"],
    graph: ["filled", "rounded", "dashed", "dotted", "solid", "bold", "striped", "radial"],
};

/** Text immediately before the cursor that looks like `attribute = partialValue`. */
const VALUE_POSITION = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9_.#]*)$/;
const WORD_BEFORE = /[A-Za-z_][A-Za-z0-9_]*$/;

/** Node types whose contents are text, where completion would be noise. */
const OPAQUE = new Set([
    "String", "ConcatString", "HTMLString", "HTMLStringContent",
    "LineComment", "BlockComment",
]);

function option(label, type, detail) {
    return detail ? { label, type, detail } : { label, type };
}

/** Nearest ancestor (or self) with one of the given names. */
function ancestor(node, names) {
    for (let current = node; current; current = current.parent) {
        if (names.includes(current.name)) return current;
    }
    return null;
}

/**
 * Which attribute set applies: an edge statement takes edge attributes, a
 * `node [...]` / `edge [...]` / `graph [...]` statement takes that kind, and a
 * plain statement with a node in it takes node attributes.
 */
function attributeKind(state, node) {
    const statement = ancestor(node, [
        "EdgeStatement", "AttributeStatement", "SimpleStatement",
        "GraphAttributeStatement", "Body",
    ]);
    if (!statement) return null;

    if (statement.name === "EdgeStatement") return "edge";
    if (statement.name === "SimpleStatement") return "node";
    if (statement.name === "GraphAttributeStatement" || statement.name === "Body") return "graph";

    if (statement.name === "AttributeStatement") {
        // First token is the literal `node`, `edge` or `graph`.
        const keyword = state.sliceDoc(statement.from, statement.from + 5).trim().split(/\s/)[0];
        return ["node", "edge", "graph"].includes(keyword) ? keyword : null;
    }

    return null;
}

function attributesFor(kind) {
    if (kind === "node") return [["node", NODE_ATTRIBUTES]];
    if (kind === "edge") return [["edge", EDGE_ATTRIBUTES]];
    if (kind === "graph") return [["graph", GRAPH_ATTRIBUTES]];

    // Unknown context: offer everything, labelled so the source is clear.
    return [["graph", GRAPH_ATTRIBUTES], ["node", NODE_ATTRIBUTES], ["edge", EDGE_ATTRIBUTES]];
}

function attributeOptions(kind) {
    const seen = new Map();
    for (const [label, names] of attributesFor(kind)) {
        for (const name of names) {
            if (seen.has(name)) seen.set(name, `${seen.get(name)}/${label}`);
            else seen.set(name, label);
        }
    }
    return [...seen].map(([name, detail]) => option(name, "property", detail));
}

/** Values offered for `attribute = ...`, or null when we have nothing useful. */
function valueOptions(attribute, kind) {
    if (attribute === "style") {
        return (STYLES[kind] ?? STYLES.node).map((v) => option(v, "constant"));
    }
    if (COLOR_ATTRIBUTES.has(attribute)) {
        return COLORS.map((v) => option(v, "constant", "color"));
    }
    if (BOOLEAN_ATTRIBUTES.has(attribute)) {
        return BOOLEANS.map((v) => option(v, "constant"));
    }
    const values = VALUES[attribute];
    return values ? values.map((v) => option(v, "constant")) : null;
}

/**
 * Completion source for DOT. Registered as language data so it only applies
 * inside a DOT document.
 */
export function dotCompletionSource(context) {
    const { state, pos } = context;
    const node = syntaxTree(state).resolveInner(pos, -1);

    if (ancestor(node, [...OPAQUE])) return null;

    const attributes = ancestor(node, ["Attributes"]);
    const kind = attributeKind(state, node);

    // Look back only as far as the enclosing bracket or the start of the line,
    // so a value on an earlier statement cannot be mistaken for this one.
    const lineStart = state.doc.lineAt(pos).from;
    const regionStart = Math.max(attributes ? attributes.from + 1 : lineStart, pos - 400);
    const before = state.sliceDoc(regionStart, pos);

    const inValue = VALUE_POSITION.exec(before);
    if (inValue) {
        const [, attribute, typed] = inValue;
        const options = valueOptions(attribute, kind);
        if (!options) return null;
        return { from: pos - typed.length, options, validFor: /^[A-Za-z0-9_.#]*$/ };
    }

    const word = WORD_BEFORE.exec(before);
    const from = word ? pos - word[0].length : pos;

    if (attributes) {
        return { from, options: attributeOptions(kind), validFor: /^[A-Za-z0-9_]*$/ };
    }

    // Statement position. Only volunteer here once something has been typed,
    // otherwise the list pops up on every fresh line.
    if (!word && !context.explicit) return null;

    return {
        from,
        options: [
            ...KEYWORDS.map((k) => option(k, "keyword")),
            ...GRAPH_ATTRIBUTES.map((a) => option(a, "property", "graph")),
        ],
        validFor: /^[A-Za-z0-9_]*$/,
    };
}
