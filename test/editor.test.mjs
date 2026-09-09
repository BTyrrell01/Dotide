import { settle, typeFresh, storedDocument, docText } from "./helpers.mjs";

export default async function ({ page, errors, check }) {
    // Indentation must be tabs, matching the default document.
    await typeFresh(page, "digraph {");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("a -> b");
    await settle(400);

    const saved = await storedDocument(page);
    check("Tab inserts a tab", (saved.split("\n")[1] ?? "").startsWith("\t"), JSON.stringify((saved.split("\n")[1] ?? "").slice(0, 10)));
    check("no space indentation introduced", !/^ +/m.test(saved), JSON.stringify(saved.slice(0, 40)));

    await typeFresh(page, "digraph {\n");
    await page.keyboard.type("x -> y");
    await settle(400);
    const autoIndent = ((await storedDocument(page)).split("\n")[1] ?? "").match(/^\s*/)[0];
    check("auto-indent uses tabs", !autoIndent.includes(" "), JSON.stringify(autoIndent));

    page.once("dialog", (d) => d.accept());
    await page.click("#reset");
    await page.waitForFunction(() => document.querySelector(".cm-content").textContent.includes("cluster_0"), { timeout: 8000 });
    await settle(400);
    const defaultDoc = await storedDocument(page);
    check("default document is all tabs",
          (defaultDoc.match(/\t/g) || []).length > 0 && !/^ +/m.test(defaultDoc),
          `${(defaultDoc.match(/\t/g) || []).length} tabs, ${(defaultDoc.match(/^ +/gm) || []).length} space-indented lines`);

    // Search must be reachable; openSearchPanel used to be imported but unbound.
    await page.click(".cm-content");
    await page.keyboard.down("Meta"); await page.keyboard.press("f"); await page.keyboard.up("Meta");
    await settle(300);
    check("search panel opens", Boolean(await page.$(".cm-search")));
    await page.keyboard.press("Escape");

    check("no page errors", errors.length === 0, errors.join(" | "));
    check("document still renders", (await docText(page)).length > 0);
}
