import { execFileSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

import { findChrome, startServer, openApp, Checker } from "./helpers.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");

// Matches the dist-*/ gitignore rule, and OUT_DIR keeps this clear of dist/ so
// a running dev server is never disturbed.
const OUT_DIR = "dist-test";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const OFF = "\u001b[0m";

function createContext(browser) {
    return browser.createBrowserContext
        ? browser.createBrowserContext()
        : browser.createIncognitoBrowserContext();
}

async function main() {
    // `npm test -- engine completion` runs only the matching suites.
    const only = process.argv.slice(2);

    process.stdout.write(`building into ${OUT_DIR}/ ... `);
    execFileSync("npm", ["run", "build"], {
        cwd: ROOT,
        env: { ...process.env, OUT_DIR },
        stdio: "pipe",
    });
    console.log("done");

    const server = await startServer(path.join(ROOT, OUT_DIR));
    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: true,
        args: ["--no-sandbox"],
        defaultViewport: { width: 1400, height: 900 },
    });

    const files = (await readdir(TEST_DIR))
        .filter((file) => file.endsWith(".test.mjs"))
        .filter((file) => only.length === 0 || only.some((name) => file.includes(name)))
        .sort();

    let total = 0;
    let failed = 0;

    for (const file of files) {
        const suite = await import(path.join(TEST_DIR, file));
        const checker = new Checker(file.replace(".test.mjs", ""));

        // A context per suite: localStorage would otherwise leak between them,
        // and clearing it in-page cannot work, because the beforeunload flush
        // writes the document straight back on the next load.
        const context = await createContext(browser);
        const { page, errors } = await openApp(context, server.origin);

        try {
            await suite.default({
                page,
                errors,
                origin: server.origin,
                check: checker.check.bind(checker),
            });
        } catch (err) {
            checker.check(`suite threw: ${err.message}`, false, err.stack?.split("\n")[1]?.trim() ?? "");
        } finally {
            await page.close();
            await context.close();
        }

        total += checker.results.length;
        failed += checker.failures.length;

        const bad = checker.failures.length;
        console.log(
            `\n${bad ? RED + "FAIL" : GREEN + "ok  "}${OFF} ${checker.name} `
            + `${DIM}(${checker.results.length} checks)${OFF}`
        );
        for (const result of checker.failures) {
            console.log(`     ${RED}x${OFF} ${result.label}${result.detail ? ` ${DIM}- ${result.detail}${OFF}` : ""}`);
        }
    }

    await browser.close();
    await server.close();
    await rm(path.join(ROOT, OUT_DIR), { recursive: true, force: true });

    console.log(`\n${failed ? RED : GREEN}${total - failed}/${total} checks passed${OFF}`);
    process.exit(failed ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
