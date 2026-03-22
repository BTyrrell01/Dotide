import * as Viz from "@viz-js/viz";

let vizInstance; // shared across functions
let renderTimeout;

export async function init() {
  vizInstance = await Viz.instance();

  // Initial render
  renderGraph("digraph {\n\ta -> b\n}");

  document.addEventListener("editor:update", (e) => {
    clearTimeout(renderTimeout);
       
    renderTimeout = setTimeout(() => {
        renderGraph(e.detail);
    }, 200); // adjust delay as needed 
  });
}

export function renderGraph(dot) {
  if (!vizInstance) return;

  try {
    const newSvg = vizInstance.renderSVGElement(dot);

    const container = document.querySelector(".right-pane");

    container.innerHTML = ""; // clear old graph
    container.appendChild(newSvg);
  } catch (err) {
    console.error("Graph render error:", err);
  }
}
