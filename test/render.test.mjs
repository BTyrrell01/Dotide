import { settle, typeFresh, docText, storedDocument, transform } from "./helpers.mjs";

/** A graph dense enough that layout takes tens of seconds. */
const PATHOLOGICAL = "digraph {\n" + Array.from({ length: 200 }, (_, i) =>
    [1, 2, 3].map((k) => `  n${i} -> n${(i * 7 + k * 13) % 200}`).join("\n")).join("\n") + "\n}";

export default async function ({ page, errors, check }) {
    check("graph rendered through the worker", (await page.$$eval("#stage svg", (e) => e.length)) === 1);
    check("no page errors on load", errors.length === 0, errors.join(" | "));

    // --- the main thread must stay usable while a layout grinds ---
    await page.click(".cm-content");
    await page.keyboard.down("Meta"); await page.keyboard.press("a"); await page.keyboard.up("Meta");
    await page.keyboard.press("Backspace");
    await page.evaluate((dot) => {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", dot);
        document.querySelector(".cm-content")
            .dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
    }, PATHOLOGICAL);

    await settle(700);
    check("busy indicator appears for a long layout", await page.$eval("#busy", (el) => !el.hidden));

    const started = Date.now();
    await page.evaluate(() => document.querySelector("#editor").getBoundingClientRect().width);
    const latency = Date.now() - started;
    check("main thread responsive during layout", latency < 300, `round-trip ${latency}ms`);

    // --- a runaway layout is aborted and the worker recovers ---
    await page.waitForFunction(
        () => { const d = document.querySelector("#diagnostics"); return !d.hidden && /timed out/i.test(d.textContent); },
        { timeout: 15000 },
    ).then(() => check("runaway layout times out", true))
     .catch(() => check("runaway layout times out", false, "no timeout message appeared"));

    check("busy indicator cleared after abort", await page.$eval("#busy", (el) => el.hidden));

    await typeFresh(page, "digraph { recovered -> yes }");
    await page.waitForFunction(
        () => document.querySelector("#stage svg")?.textContent.includes("recovered"),
        { timeout: 10000 },
    ).then(() => check("renders again after the worker restarts", true))
     .catch(() => check("renders again after the worker restarts", false));

    // --- persistence ---
    check("document saved to localStorage", /recovered/.test((await storedDocument(page)) ?? ""));
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });
    check("document restored after reload", /recovered/.test(await docText(page)));
    check("restored document rendered", await page.$eval("#stage svg", (el) => el.textContent.includes("recovered")));

    // --- pan and zoom ---
    check("view starts at identity", (await transform(page)) === "translate(0px, 0px) scale(1)", await transform(page));

    await page.click('[data-zoom="in"]');
    check("+ zooms in", /scale\(1\.25\)/.test(await transform(page)), await transform(page));
    await page.click('[data-zoom="in"]');
    await page.click('[data-zoom="out"]');
    check("- zooms back out", /scale\(1\.25\)/.test(await transform(page)), await transform(page));
    await page.click('[data-zoom="home"]');
    check("home resets zoom", (await transform(page)) === "translate(0px, 0px) scale(1)", await transform(page));

    const box = await page.$eval("#graph", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w / 2 + 60, box.y + box.h / 2 + 40, { steps: 5 });
    await page.mouse.up();
    check("drag pans", /translate\(60px, 40px\)/.test(await transform(page)), await transform(page));

    await page.click('[data-zoom="home"]');
    check("home resets pan", (await transform(page)) === "translate(0px, 0px) scale(1)", await transform(page));

    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.wheel({ deltaY: -200 });
    const wheeled = await transform(page);
    const parsed = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(wheeled);
    check("wheel zooms in", parsed && parseFloat(parsed[3]) > 1, wheeled);
    if (parsed) {
        const [, tx, , scale] = parsed.map(Number);
        // The point under the cursor must not move.
        check("wheel zoom is anchored at the cursor", Math.abs((100 - tx) / scale - 100) < 0.01,
              `stage point under cursor: ${((100 - tx) / scale).toFixed(2)} (want 100)`);
    }

    // --- exports use the rendered SVG, not the on-screen transform ---
    const exported = await page.evaluate(async () => {
        const blobs = new Map();
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { const url = create(blob); blobs.set(url, blob); return url; };

        let captured = null;
        HTMLAnchorElement.prototype.click = function () { captured = { name: this.download, blob: blobs.get(this.href) }; };

        const results = {};
        for (const kind of ["svg", "dot", "png"]) {
            captured = null;
            document.querySelector(`[data-export="${kind}"]`).click();
            await new Promise((r) => setTimeout(r, 1200));
            if (!captured) continue;
            const bytes = new Uint8Array(await captured.blob.arrayBuffer());
            results[kind] = {
                name: captured.name,
                type: captured.blob.type,
                magic: [...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" "),
                size: captured.blob.size,
            };
        }
        return results;
    });

    check("SVG exports", exported.svg?.type === "image/svg+xml", JSON.stringify(exported.svg));
    check("DOT source exports", exported.dot?.type === "text/vnd.graphviz", JSON.stringify(exported.dot));
    check("PNG exports with a PNG signature", exported.png?.magic === "89 50 4e 47", JSON.stringify(exported.png));
    check("exports are named after the graph", exported.svg?.name?.endsWith(".svg"), exported.svg?.name);
}
