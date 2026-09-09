import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
].filter(Boolean);

/** Locates a Chrome to drive. Set CHROME_PATH to override. */
export function findChrome() {
    const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!found) {
        throw new Error(
            "No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.\n"
            + `Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`
        );
    }
    return found;
}

const CONTENT_TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
};

/**
 * Serves a directory on an ephemeral port, so tests never collide with a dev
 * server or with another test run.
 */
export function startServer(root) {
    const server = createServer(async (request, response) => {
        const relative = request.url === "/" ? "/index.html" : request.url.split("?")[0];
        const file = path.join(root, path.normalize(relative));

        // Refuse anything that escapes the served directory.
        if (!file.startsWith(path.resolve(root))) {
            response.writeHead(403).end("forbidden");
            return;
        }

        try {
            const body = await readFile(file);
            response.writeHead(200, {
                "Content-Type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
            });
            response.end(body);
        } catch {
            response.writeHead(404).end("not found");
        }
    });

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            resolve({
                origin: `http://127.0.0.1:${port}/`,
                close: () => new Promise((done) => server.close(done)),
            });
        });
    });
}

/** Collects pass/fail results for one suite. */
export class Checker {
    constructor(name) {
        this.name = name;
        this.results = [];
    }

    check(label, passed, detail = "") {
        this.results.push({ label, passed: Boolean(passed), detail });
    }

    get failures() {
        return this.results.filter((r) => !r.passed);
    }
}

/** Opens a page in the given browser context, recording anything it complains about. */
export async function openApp(context, origin) {
    const page = await context.newPage();
    const errors = [];

    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForSelector("#stage svg", { timeout: 20000 });

    return { page, errors };
}

export const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

/** Replaces the whole document by typing, so the normal onChange path runs. */
export async function typeFresh(page, text, delay = 6) {
    await page.click(".cm-content");
    await page.keyboard.down("Meta");
    await page.keyboard.press("a");
    await page.keyboard.up("Meta");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(text, { delay });
    await settle();
}

export const docText = (page) =>
    page.evaluate(() => document.querySelector(".cm-content").textContent);

export const storedDocument = (page) =>
    page.evaluate(() => localStorage.getItem("dotide:document"));

/** Labels currently in the completion tooltip, or [] when it is closed. */
export async function completions(page) {
    if (!(await page.$(".cm-tooltip-autocomplete"))) return [];
    return page.$$eval(".cm-tooltip-autocomplete li", (els) => els.map((e) => e.textContent.trim()));
}

/** Caret offset within the document, read from the live selection. */
export const caretOffset = (page) =>
    page.evaluate(() => {
        const range = window.getSelection().getRangeAt(0);
        const upToCaret = range.cloneRange();
        upToCaret.selectNodeContents(document.querySelector(".cm-content"));
        upToCaret.setEnd(range.endContainer, range.endOffset);
        return upToCaret.toString().length;
    });

export const transform = (page) => page.$eval("#stage", (el) => el.style.transform);
