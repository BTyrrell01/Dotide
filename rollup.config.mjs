import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import resolve from "@rollup/plugin-node-resolve";
import serve from "rollup-plugin-serve";

const STATIC_DIR = "public";

// rollup sets this when invoked with --watch.
const watching = process.env.ROLLUP_WATCH === "true";

/**
 * Build output directory and dev-server port, both overridable so a second
 * instance can run without disturbing one already using dist/ and port 10001:
 *
 *     OUT_DIR=dist-check PORT=10099 npm run build
 */
const OUT_DIR = checkedOutDir(process.env.OUT_DIR || "dist");
const DEV_PORT = Number(process.env.PORT) || 10001;

/**
 * The build clears its output directory, so OUT_DIR drives a recursive delete.
 * It comes from the environment, which means a stray value like "." or "/"
 * would wipe the working tree. Only allow directories strictly inside the
 * project.
 */
function checkedOutDir(value) {
    const root = path.resolve(".");
    const resolved = path.resolve(value);

    if (resolved === root || !resolved.startsWith(root + path.sep)) {
        throw new Error(
            `OUT_DIR must name a directory inside the project; got "${value}" `
            + `which resolves to "${resolved}".`
        );
    }

    return value;
}

/**
 * Copies everything in public/ into the build output, preserving structure.
 * Reading the directory rather than listing files means a new asset is picked
 * up just by being dropped in.
 */
function copyStatic() {
    return {
        name: "copy-static",
        async buildStart() {
            // Clear stale output (old sourcemaps, renamed chunks) on a one-off
            // build. Skipped while watching, where the dev server is reading
            // from this directory.
            if (!watching) await rm(OUT_DIR, { recursive: true, force: true });

            // Rebuild when a static file changes, not just the JS.
            for (const file of await staticFiles()) this.addWatchFile(file);
        },
        async writeBundle() {
            for (const file of await staticFiles()) {
                const destination = path.join(OUT_DIR, path.relative(STATIC_DIR, file));
                await mkdir(path.dirname(destination), { recursive: true });
                await copyFile(file, destination);
            }
        },
    };
}

/** Every file under public/, ignoring dotfiles such as .DS_Store. */
async function staticFiles() {
    const entries = await readdir(STATIC_DIR, { recursive: true, withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

export default {
    // The worker is a second entry point; main.js loads it by output filename.
    input: {
        main: "src/main.js",
        worker: "src/worker.js",
    },
    output: {
        dir: OUT_DIR,
        format: "esm",
        entryFileNames: "[name].js",
        sourcemap: watching,
    },
    plugins: [
        resolve(),
        copyStatic(),
        // Serving during a one-off build would never exit.
        watching && serve({ contentBase: OUT_DIR, port: DEV_PORT }),
    ],
};
