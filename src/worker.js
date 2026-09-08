import { instance } from "@viz-js/viz";

// Compiling the Graphviz WASM takes a moment; requests that arrive first queue
// behind this promise rather than racing it.
const ready = instance();

self.onmessage = async ({ data: { id, dot, engine } }) => {
    try {
        const viz = await ready;
        // render() reports bad DOT in result.errors instead of throwing, so a
        // syntax error comes back as a normal message.
        self.postMessage({ id, ok: true, result: viz.render(dot, { format: "svg", engine }) });
    } catch (err) {
        self.postMessage({ id, ok: false, message: String(err?.message ?? err) });
    }
};
