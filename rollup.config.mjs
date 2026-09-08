import { copyFile, mkdir } from "node:fs/promises";
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
        buildStart() {
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
    input: "src/main.js",
    output: {
        dir: OUT_DIR,
        format: "esm",
        sourcemap: watching,
    },
    plugins: [
        resolve(),
        copyStatic(STATIC_FILES),
        // Serving during a one-off build would never exit.
        watching && serve({ contentBase: OUT_DIR, port: 10001 }),
    ],
};
