import { settle } from "./helpers.mjs";

const rootTheme = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const surface = (page) => page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor);
/**
 * The first non-transparent background up the tree. In light mode the editor
 * itself is transparent and shows the pane behind it, so comparing its own
 * backgroundColor would compare against rgba(0, 0, 0, 0).
 */
const editorBackground = (page) => page.evaluate(() => {
    let element = document.querySelector(".cm-editor");
    while (element) {
        const background = getComputedStyle(element).backgroundColor;
        if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
            return background;
        }
        element = element.parentElement;
    }
    return "rgb(255, 255, 255)";
});

/** Rough luminance, to assert dark is actually darker rather than merely different. */
const luminance = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export default async function ({ page, errors, check }) {
    const options = await page.$$eval("#theme option", (o) => o.map((x) => x.value));
    check("theme options offered", options.join(",") === "system,light,dark", options.join(", "));
    check("defaults to system", (await page.$eval("#theme", (e) => e.value)) === "system");
    check("a theme is resolved onto the root element", ["light", "dark"].includes(await rootTheme(page)),
          await rootTheme(page));

    await page.select("#theme", "light");
    await settle(300);
    const lightBody = await surface(page);
    const lightEditor = await editorBackground(page);
    check("light resolves to light", (await rootTheme(page)) === "light");

    await page.select("#theme", "dark");
    await settle(400);
    const darkBody = await surface(page);
    const darkEditor = await editorBackground(page);
    check("dark resolves to dark", (await rootTheme(page)) === "dark");
    check("page chrome darkens", luminance(darkBody) < luminance(lightBody),
          `${lightBody} -> ${darkBody}`);
    check("editor darkens too", luminance(darkEditor) < luminance(lightEditor),
          `${lightEditor} -> ${darkEditor}`);

    // Text must stay readable, not stay dark on a dark background.
    const textLuminance = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".app-header h1")).color);
    check("header text lightens for contrast", luminance(textLuminance) > 128, textLuminance);

    // The editor keeps its document and history across a theme swap.
    await page.click(".cm-content");
    await page.keyboard.type("  ");
    const before = await page.evaluate(() => document.querySelector(".cm-content").textContent);
    await page.select("#theme", "light");
    await settle(300);
    const after = await page.evaluate(() => document.querySelector(".cm-content").textContent);
    check("document survives a theme change", before === after);

    await page.select("#theme", "dark");
    await settle(300);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });
    check("choice persists across reload", (await page.$eval("#theme", (e) => e.value)) === "dark");
    check("resolved theme reapplied on load", (await rootTheme(page)) === "dark");

    await page.evaluate(() => localStorage.setItem("dotide:theme", "chartreuse"));
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });
    check("unknown stored theme falls back", (await page.$eval("#theme", (e) => e.value)) === "system");

    // The graph must still render, and exports are unaffected by the theme.
    check("graph still renders", (await page.$$eval("#stage svg", (e) => e.length)) === 1);
    check("no page errors", errors.length === 0, errors.join(" | "));
}
