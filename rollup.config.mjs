import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import resolve from "@rollup/plugin-node-resolve";
import serve from "rollup-plugin-serve";

const OUT_DIR = "dist";
const STATIC_DIR = "public";

// rollup sets this when invoked with --watch.
const watching = process.env.ROLLUP_WATCH === "true";

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
        watching && serve({ contentBase: OUT_DIR, port: 10001 }),
    ],
};
