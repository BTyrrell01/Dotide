import { settle } from "./helpers.mjs";

const viewBox = (page) => page.$eval("#stage svg", (el) => el.getAttribute("viewBox"));

export default async function ({ page, errors, check }) {
    const engines = await page.$$eval("#engine option", (o) => o.map((x) => x.value));
    check("eight layout engines offered", engines.length === 8, engines.join(", "));
    check("nop variants excluded", !engines.some((e) => e.startsWith("nop")), engines.join(", "));
    check("defaults to dot", (await page.$eval("#engine", (e) => e.value)) === "dot");

    const geometries = new Map();
    for (const engine of engines) {
        await page.select("#engine", engine);
        await settle(900);

        const box = await viewBox(page);
        const diagnostics = await page.$eval("#diagnostics", (el) => ({
            hidden: el.hidden,
            error: el.className.includes("--error"),
            text: el.textContent.slice(0, 50),
        }));
        geometries.set(engine, box);

        check(`${engine} renders without an error banner`,
              Boolean(box) && !(!diagnostics.hidden && diagnostics.error),
              `viewBox ${box}${diagnostics.hidden ? "" : ` | ${diagnostics.error ? "ERROR" : "advisory"}: ${diagnostics.text}`}`);
    }

    check("engines produce distinct layouts", new Set(geometries.values()).size > 4,
          `${new Set(geometries.values()).size} distinct of ${engines.length}`);

    await page.select("#engine", "circo");
    await settle(800);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });
    check("engine choice persists", (await page.$eval("#engine", (e) => e.value)) === "circo");

    await page.evaluate(() => localStorage.setItem("dotide:engine", "no-such-engine"));
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });
    check("unknown stored engine falls back to dot", (await page.$eval("#engine", (e) => e.value)) === "dot");

    // Exports must follow the selected engine, not silently use dot.
    await page.select("#engine", "circo");
    await settle(900);
    const onScreen = await viewBox(page);
    const exportedViewBox = await page.evaluate(async () => {
        const blobs = new Map();
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { const url = create(blob); blobs.set(url, blob); return url; };
        let captured = null;
        HTMLAnchorElement.prototype.click = function () { captured = blobs.get(this.href); };
        document.querySelector('[data-export="svg"]').click();
        await new Promise((r) => setTimeout(r, 800));
        return captured ? /viewBox="([^"]+)"/.exec(await captured.text())?.[1] : null;
    });
    check("SVG export uses the selected engine", exportedViewBox === onScreen,
          `export ${exportedViewBox} vs on-screen ${onScreen}`);

    check("no page errors", errors.length === 0, errors.join(" | "));
}
