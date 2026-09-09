import { settle, typeFresh, docText, storedDocument, transform } from "./helpers.mjs";

export default async function ({ page, errors, check }) {
    await typeFresh(page, "digraph { my_old_work -> here }");
    await settle(600);
    check("custom document saved", (await storedDocument(page)).includes("my_old_work"));

    // Cancelling must change nothing.
    page.once("dialog", (d) => d.dismiss());
    await page.click("#reset");
    await settle();
    check("cancelling leaves the document alone", (await docText(page)).includes("my_old_work"));

    await page.click('[data-zoom="in"]');
    const zoomed = await transform(page);

    page.once("dialog", (d) => d.accept());
    await page.click("#reset");
    await page.waitForFunction(
        () => document.querySelector(".cm-content").textContent.includes("cluster_0"),
        { timeout: 8000 },
    ).then(() => check("reset restores the default document", true))
     .catch(() => check("reset restores the default document", false));

    await page.waitForFunction(
        () => document.querySelector("#stage svg")?.outerHTML.includes("process #1"),
        { timeout: 10000 },
    ).then(() => check("default graph re-rendered", true))
     .catch(() => check("default graph re-rendered", false));

    check("reset also resets the view", (await transform(page)) === "translate(0px, 0px) scale(1)",
          `${zoomed} -> ${await transform(page)}`);

    await settle(600);
    check("reset persisted", (await storedDocument(page)).includes("cluster_0"));

    // The reason this button exists: clearing localStorage and reloading cannot
    // work, because the beforeunload flush writes the old document back.
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });
    check("reset survives a reload", (await docText(page)).includes("cluster_0"),
          JSON.stringify((await docText(page)).slice(0, 24)));

    check("no page errors", errors.length === 0, errors.join(" | "));
}
