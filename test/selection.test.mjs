import { settle, typeFresh, docText } from "./helpers.mjs";

/** Screen centre of the node or edge with the given title. */
const centreOf = (page, title) => page.evaluate((wanted) => {
    const match = [...document.querySelectorAll("#stage svg g.node title, #stage svg g.edge title")]
        .find((t) => t.textContent === wanted);
    if (!match) return null;
    const box = match.parentElement.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}, title);

const highlighted = (page) =>
    page.$$eval(".cm-graph-highlight", (els) => els.map((e) => e.textContent));

/** Titles of the shapes currently marked as selected in the SVG. */
const markedInGraph = (page) =>
    page.$$eval("#stage .is-selected", (els) =>
        els.map((e) => e.querySelector("title")?.textContent).filter(Boolean));

/** Stroke actually painted on a node's shape, to prove the CSS beats Graphviz. */
const strokeOf = (page, title) => page.evaluate((wanted) => {
    const match = [...document.querySelectorAll("#stage svg g.node title")]
        .find((t) => t.textContent === wanted);
    const shape = match?.parentElement.querySelector("ellipse, polygon, path");
    return shape ? getComputedStyle(shape).stroke : null;
}, title);

export default async function ({ page, errors, check }) {
    // a3 appears four times in the default document.
    const a3 = await centreOf(page, "a3");
    await page.mouse.click(a3.x, a3.y);
    await settle(300);

    let marks = await highlighted(page);
    check("clicking a node highlights it", marks.length > 0, `${marks.length} marks: ${marks.join(", ")}`);
    check("every occurrence is highlighted", marks.length === 4 && marks.every((m) => m === "a3"),
          `${marks.length} marks: ${marks.join(", ")}`);

    // Clicking empty space clears.
    const pane = await page.$eval("#graph", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + 12, y: r.y + r.height - 12 };
    });
    await page.mouse.click(pane.x, pane.y);
    await settle(300);
    check("clicking empty space clears the highlight", (await highlighted(page)).length === 0);

    // Edges resolve to their own statement, not the whole chain.
    const edge = await centreOf(page, "a0->a1");
    await page.mouse.click(edge.x, edge.y);
    await settle(300);
    marks = await highlighted(page);
    check("clicking an edge highlights it", marks.length === 1, marks.join(" | "));
    check("edge highlight covers only that pair, not the chain",
          marks[0]?.replace(/\s+/g, " ") === "a0 -> a1", JSON.stringify(marks[0]));

    // Plain drag must still pan, and must not select.
    await page.mouse.click(pane.x, pane.y);
    await settle(200);
    const before = await page.$eval("#stage", (el) => el.style.transform);
    const a0 = await centreOf(page, "a0");
    await page.mouse.move(a0.x, a0.y);
    await page.mouse.down();
    await page.mouse.move(a0.x + 80, a0.y + 40, { steps: 6 });
    await page.mouse.up();
    await settle(300);
    check("plain drag still pans", (await page.$eval("#stage", (el) => el.style.transform)) !== before);
    check("plain drag does not select", (await highlighted(page)).length === 0);

    await page.click('[data-zoom="home"]');
    await settle(200);

    // Shift-drag draws a marquee and selects everything inside it.
    const b0 = await centreOf(page, "b0");
    const b3 = await centreOf(page, "b3");
    await page.keyboard.down("Shift");
    await page.mouse.move(b0.x - 60, b0.y - 40);
    await page.mouse.down();
    await page.mouse.move(b3.x + 60, b3.y + 40, { steps: 8 });
    const marqueeVisible = await page.$eval(".marquee", (el) => !el.hidden);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await settle(400);

    check("marquee is drawn during a shift-drag", marqueeVisible);
    check("marquee is hidden afterwards", await page.$eval(".marquee", (el) => el.hidden));

    marks = await highlighted(page);
    const text = marks.join(" ");
    check("marquee selects the enclosed nodes",
          ["b0", "b1", "b2", "b3"].every((n) => text.includes(n)), `${marks.length} marks: ${text}`);
    check("marquee excludes nodes outside it", !text.includes("a0"), text);

    // An edge's bounding box spans its whole curve, so intersection alone would
    // pull in edges that merely pass near the box.
    check("edges leaving the box are not selected",
          !marks.some((m) => /start\s*->\s*b0|a1\s*->\s*b3|b2\s*->\s*a3|b3\s*->\s*end/.test(m)),
          marks.join(" | "));
    check("edges wholly inside the box are selected",
          marks.some((m) => /b0\s*->\s*b1/.test(m)), marks.join(" | "));

    // Shift-dragging must not leave the browser's own text selection behind.
    const strayTextSelection = await page.evaluate(() => window.getSelection().toString().trim());
    check("shift-drag does not select SVG text", strayTextSelection === "", JSON.stringify(strayTextSelection));

    // A shift-drag that barely moves should not wipe the selection.
    const previous = (await highlighted(page)).length;
    await page.keyboard.down("Shift");
    await page.mouse.move(pane.x, pane.y);
    await page.mouse.down();
    await page.mouse.move(pane.x + 1, pane.y + 1);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await settle(300);
    check("a tiny shift-drag is ignored", (await highlighted(page)).length === previous);

    // Editing must drop a highlight that no longer means anything.
    await page.mouse.click((await centreOf(page, "a3")).x, (await centreOf(page, "a3")).y);
    await settle(300);
    check("re-selected before the edit check", (await highlighted(page)).length > 0);
    await page.click(".cm-content");
    await page.keyboard.type("  ");
    await settle(300);
    check("editing clears a stale highlight", (await highlighted(page)).length === 0);

    // Quoted node names resolve too.
    await typeFresh(page, 'digraph { "my node" -> other }');
    await page.waitForFunction(() => document.querySelector("#stage svg")?.textContent.includes("my node"), { timeout: 8000 });
    const quoted = await centreOf(page, "my node");
    await page.mouse.click(quoted.x, quoted.y);
    await settle(300);
    marks = await highlighted(page);
    check("quoted node names resolve to source", marks.length === 1 && marks[0].includes("my node"),
          JSON.stringify(marks));

    check("document not modified by selecting", (await docText(page)).includes("my node"));
    // --- the graph itself must show what is selected ---
    page.once("dialog", (d) => d.accept());
    await page.click("#reset");
    await page.waitForFunction(() => document.querySelector(".cm-content").textContent.includes("cluster_0"), { timeout: 8000 });
    await settle(600);

    const strokeBefore = await strokeOf(page, "a3");
    const a3again = await centreOf(page, "a3");
    await page.mouse.click(a3again.x, a3again.y);
    await settle(300);

    check("the clicked node is marked in the graph", (await markedInGraph(page)).includes("a3"),
          (await markedInGraph(page)).join(", "));
    const strokeAfter = await strokeOf(page, "a3");
    check("the mark actually repaints the stroke", strokeAfter !== strokeBefore,
          `${strokeBefore} -> ${strokeAfter}`);

    // Clicking empty space clears the graph mark as well as the editor one.
    await page.mouse.click(pane.x, pane.y);
    await settle(300);
    check("clearing removes the graph mark", (await markedInGraph(page)).length === 0);

    // Selecting an edge marks the edge, not its endpoints.
    const edgeAgain = await centreOf(page, "a0->a1");
    await page.mouse.click(edgeAgain.x, edgeAgain.y);
    await settle(300);
    check("a selected edge is marked", (await markedInGraph(page)).join() === "a0->a1",
          (await markedInGraph(page)).join(", "));

    // The selection must survive a re-render that is not an edit.
    await page.select("#engine", "neato");
    await page.waitForFunction(() => document.querySelector("#stage svg"), { timeout: 10000 });
    await settle(900);
    check("selection survives an engine change", (await markedInGraph(page)).includes("a0->a1"),
          (await markedInGraph(page)).join(", "));
    await page.select("#engine", "dot");
    await settle(900);

    // An edit clears both sides, since the graph is about to be replaced.
    await page.mouse.click((await centreOf(page, "a3")).x, (await centreOf(page, "a3")).y);
    await settle(300);
    check("selected again before the edit check", (await markedInGraph(page)).length > 0);
    await page.click(".cm-content");
    await page.keyboard.type(" ");
    await settle(500);
    check("editing clears the graph mark too", (await markedInGraph(page)).length === 0,
          (await markedInGraph(page)).join(", "));
    check("editing clears the editor highlight too", (await highlighted(page)).length === 0);

    check("no page errors", errors.length === 0, errors.join(" | "));
}
