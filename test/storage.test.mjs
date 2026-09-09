import { settle, docText } from "./helpers.mjs";

/**
 * Safari private browsing, and storage disabled by policy, make every
 * localStorage access *throw* rather than return null. storage.js guards each
 * access for that reason; without the guard, loadDocument would throw out of
 * main() and the app would show "Failed to start" instead of an editor.
 */
export default async function ({ page, errors, check }) {
    // Save something first, so the reload below would have had a document to
    // restore if reading were working. That distinguishes "reading threw" from
    // "there was nothing stored".
    await page.click(".cm-content");
    await page.keyboard.down("Meta"); await page.keyboard.press("a"); await page.keyboard.up("Meta");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("digraph { stored_before_blocking -> yes }", { delay: 6 });
    await settle(600);
    check("a document was stored while storage worked",
          (await page.evaluate(() => localStorage.getItem("dotide:document")))?.includes("stored_before_blocking"));

    // Puppeteer reports console.warn as type "warn"; older versions say
    // "warning", so accept either.
    const warnings = [];
    page.on("console", (message) => {
        if (message.type() === "warn" || message.type() === "warning") warnings.push(message.text());
    });

    // Applies to the next navigation, before any of the app's own scripts run.
    await page.evaluateOnNewDocument(() => {
        const blocked = () => { throw new DOMException("storage is disabled", "SecurityError"); };
        Storage.prototype.getItem = blocked;
        Storage.prototype.setItem = blocked;
        Storage.prototype.removeItem = blocked;
    });

    const errorsBefore = errors.length;
    await page.reload({ waitUntil: "networkidle0" });

    // The app must still start. Without the guard this selector never appears,
    // because main() throws before the editor is built.
    await page.waitForSelector("#stage svg", { timeout: 20000 })
        .then(() => check("the app still starts when storage throws", true))
        .catch(() => check("the app still starts when storage throws", false, "no graph rendered"));

    check("no start-up failure is shown", await page.$eval("#diagnostics", (el) => el.hidden),
          await page.$eval("#diagnostics", (el) => el.textContent.slice(0, 60)));
    check("the editor is usable", Boolean(await page.$(".cm-content")));

    // Reading threw, so the default document is used rather than what was saved.
    const text = await docText(page);
    check("falls back to the default document", text.includes("cluster_0") && !text.includes("stored_before_blocking"),
          JSON.stringify(text.slice(0, 40)));

    // The selectors fall back too, rather than being left blank.
    check("engine falls back to dot", (await page.$eval("#engine", (e) => e.value)) === "dot");
    check("theme falls back to system", (await page.$eval("#theme", (e) => e.value)) === "system");

    // Writing throws on every keystroke; editing must still render.
    await page.click(".cm-content");
    await page.keyboard.down("Meta"); await page.keyboard.press("a"); await page.keyboard.up("Meta");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("digraph { writes_still_throw -> fine }", { delay: 6 });
    await page.waitForFunction(
        () => document.querySelector("#stage svg")?.textContent.includes("writes_still_throw"),
        { timeout: 10000 },
    ).then(() => check("editing still renders when writing throws", true))
     .catch(() => check("editing still renders when writing throws", false));

    // Changing a setting also writes; it must not break either.
    await page.select("#engine", "circo");
    await settle(900);
    check("changing the engine survives a failing write",
          (await page.$eval("#engine", (e) => e.value)) === "circo");
    check("the graph re-rendered after the engine change",
          (await page.$$eval("#stage svg", (e) => e.length)) === 1);

    // The guard reports rather than swallowing silently.
    check("the failure is warned about, not hidden",
          warnings.some((w) => /could not (read|save)/i.test(w)),
          warnings.slice(0, 2).join(" | ") || "(no warnings seen)");

    // Guarded failures must not surface as page errors.
    check("no page errors despite storage throwing", errors.length === errorsBefore,
          errors.slice(errorsBefore).join(" | "));
}
