import { settle, typeFresh, docText, completions, caretOffset } from "./helpers.mjs";

export default async function ({ page, errors, check }) {
    // --- attribute names, by context ---
    await typeFresh(page, "digraph { a [sh");
    let list = await completions(page);
    check("node attribute names offered", list.some((x) => x.startsWith("shape")), list.slice(0, 4).join(", "));

    await typeFresh(page, "digraph { a -> b [arrow");
    list = await completions(page);
    check("edge attributes offered on an edge", list.some((x) => x.startsWith("arrowhead")), list.slice(0, 3).join(", "));

    await typeFresh(page, "digraph { a [arrow");
    list = await completions(page);
    check("edge-only attributes absent on a node", !list.some((x) => x.startsWith("arrowhead")), list.slice(0, 3).join(", ") || "(none)");

    await typeFresh(page, "digraph { node [per");
    list = await completions(page);
    check("`node [...]` uses node attributes", list.some((x) => x.startsWith("peripheries")), list.slice(0, 3).join(", "));

    // --- values, by attribute ---
    await typeFresh(page, "digraph { a [shape=");
    list = await completions(page);
    check("shape values offered", list.includes("box") && list.some((x) => x.includes("Msquare")), list.slice(0, 5).join(", "));
    check("values are not attribute names", !list.includes("rankdir"), list.slice(0, 5).join(", "));

    await typeFresh(page, "digraph { a -> b [style=");
    list = await completions(page);
    check("edge style values", list.includes("tapered") && !list.includes("filled"), list.join(", "));

    await typeFresh(page, "digraph { a [style=");
    list = await completions(page);
    check("node style values", list.includes("filled") && !list.includes("tapered"), list.join(", "));

    await typeFresh(page, "digraph { a [fillcolor=sal");
    list = await completions(page);
    check("colour values offered", list.some((x) => x.startsWith("salmon")), list.slice(0, 3).join(", "));

    // --- quoting: free text quoted, enums bare ---
    await typeFresh(page, "digraph { a [labe");
    await page.keyboard.press("Tab");
    await settle(300);
    let text = await docText(page);
    check('label completes to label=""', text.includes('label=""'), JSON.stringify(text));
    check("caret sits between the quotes",
          (await caretOffset(page)) === text.indexOf('label=""') + 'label="'.length);
    await page.keyboard.type("my process");
    check("no list while typing prose", (await completions(page)).length === 0);
    check("label text lands inside the quotes", (await docText(page)).includes('label="my process"'));

    await typeFresh(page, "digraph { a [shap");
    await page.keyboard.press("Tab");
    await settle(500);
    text = await docText(page);
    check("enum attribute completes bare", text.includes("shape=") && !text.includes('shape="'), JSON.stringify(text));
    check("value list opens automatically", (await completions(page)).includes("box"));
    await page.keyboard.type("diam");
    await settle(350);
    await page.keyboard.press("Tab");
    await settle(300);
    text = await docText(page);
    check("enum value stays unquoted", /shape=diamond/.test(text) && !/shape="/.test(text), JSON.stringify(text));

    await typeFresh(page, "digraph { rankd");
    await page.keyboard.press("Tab");
    await settle(400);
    check("statement-level attribute supplies the =", /rankdir=/.test(await docText(page)), JSON.stringify(await docText(page)));
    check("statement-level value list opens", (await completions(page)).includes("LR"));

    await typeFresh(page, 'digraph { a [shape="dia');
    list = await completions(page);
    check("values complete inside existing quotes", list.some((x) => x.startsWith("diamond")), list.slice(0, 3).join(", "));

    // --- document-aware identifiers ---
    await typeFresh(page, "digraph { ingest -> validate -> transform\n\tingest -> t");
    list = await completions(page);
    check("known node ids offered after an edge operator", list.some((x) => x.startsWith("transform")), list.slice(0, 3).join(", "));
    check("the word being typed is not offered as a node", !list.some((x) => x === "tnode"), list.slice(0, 3).join(", "));

    await typeFresh(page, "digraph { alpha -> beta\n\tal");
    list = await completions(page);
    check("node ids offered at statement position", list.some((x) => x.startsWith("alpha")), list.slice(0, 3).join(", "));

    // Node names are global in DOT, so a node declared in a cluster counts outside it.
    await typeFresh(page, "digraph { subgraph cluster_0 { inner_node -> other } inner");
    list = await completions(page);
    check("ids from inside a cluster are offered outside it", list.some((x) => x.startsWith("inner_node")), list.slice(0, 3).join(", "));

    await typeFresh(page, "digraph { a:myport -> b\n\tmyp");
    list = await completions(page);
    check("port names are not harvested as nodes", !list.some((x) => x.startsWith("myport")), list.slice(0, 3).join(", ") || "(none)");

    await typeFresh(page, 'digraph { "my node" -> b\n\tmy');
    list = await completions(page);
    check("quoted ids offered", list.some((x) => x.startsWith("my node")), list.slice(0, 3).join(", "));
    if (list.some((x) => x.startsWith("my node"))) {
        await page.keyboard.press("Tab");
        await settle(300);
        const occurrences = ((await docText(page)).match(/"my node"/g) || []).length;
        check("quoted id inserted with its quotes", occurrences === 2, `${occurrences} occurrence(s), want 2`);
    }

    await typeFresh(page, "digraph { compound=true subgraph cluster_a { x } subgraph cluster_b { y } x -> y [lhead=");
    list = await completions(page);
    check("lhead offers cluster names",
          list.some((x) => x.startsWith("cluster_a")) && list.some((x) => x.startsWith("cluster_b")), list.join(", "));

    // --- quiet where it would be noise ---
    await typeFresh(page, 'digraph { a [label="sh');
    check("silent inside a string", (await completions(page)).length === 0);
    await typeFresh(page, "digraph { // sh");
    check("silent inside a comment", (await completions(page)).length === 0);

    // --- Tab accepts, and still indents otherwise ---
    await typeFresh(page, "digraph { a [sha");
    const wasOpen = (await completions(page)).length > 0;
    await page.keyboard.press("Tab");
    await settle(300);
    check("Tab accepts a completion", wasOpen && (await docText(page)).includes("shape"), JSON.stringify((await docText(page)).slice(0, 30)));
    // Accepting an enum attribute deliberately chains into its value list.
    await settle(400);
    check("accepting an attribute opens its value list", (await completions(page)).includes("box"));
    await page.keyboard.type("circ");
    await settle(350);
    await page.keyboard.press("Tab");
    await settle(300);
    check("accepting a value closes the list", (await completions(page)).length === 0);
    check("chained accept produced shape=circle", /shape=circle/.test(await docText(page)), JSON.stringify(await docText(page)));

    await typeFresh(page, "digraph {");
    await page.keyboard.press("Enter");
    const before = await docText(page);
    await page.keyboard.press("Tab");
    await settle(250);
    check("Tab still indents when nothing is open", (await docText(page)).length > before.length);

    await typeFresh(page, "digraph { a -> b }");
    await page.waitForFunction(() => document.querySelector("#stage svg"), { timeout: 8000 });
    check("editor still renders graphs", (await page.$$eval("#stage svg", (e) => e.length)) === 1);
    check("no page errors", errors.length === 0, errors.join(" | "));
}
