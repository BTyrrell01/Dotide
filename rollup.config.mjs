import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import resolve from "@rollup/plugin-node-resolve";
import serve from "rollup-plugin-serve";

const OUT_DIR = "dist";
const STATIC_FILES = ["public/index.html", "public/style.css"];

// rollup sets this when invoked with --watch.
const watching = process.env.ROLLUP_WATCH === "true";

/** Copies hand-written static assets into the build output. */
function copyStatic(files) {
    return {
        name: "copy-static",
        async buildStart() {
            // Clear stale output (old sourcemaps, renamed chunks) on a one-off
            // build. Skipped while watching, where the dev server is reading
            // from this directory.
            if (!watching) await rm(OUT_DIR, { recursive: true, force: true });

            // Rebuild when the HTML/CSS change, not just the JS.
            files.forEach((file) => this.addWatchFile(file));
        },
        async writeBundle() {
            await mkdir(OUT_DIR, { recursive: true });
            await Promise.all(files.map((file) =>
                copyFile(file, path.join(OUT_DIR, path.basename(file)))
            ));
        },
    };
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
        copyStatic(STATIC_FILES),
        // Serving during a one-off build would never exit.
        watching && serve({ contentBase: OUT_DIR, port: 10001 }),
    ],
};
