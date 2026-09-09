export const DEFAULT_THEME = "system";

const SYSTEM_DARK = window.matchMedia("(prefers-color-scheme: dark)");

/** Resolves a choice, including "system", to the theme actually shown. */
export function resolveTheme(choice) {
    if (choice === "system") return SYSTEM_DARK.matches ? "dark" : "light";
    return choice === "dark" ? "dark" : "light";
}

/**
 * Applies the chosen theme to the document and reports the resolved value, so
 * the editor can be reconfigured to match.
 *
 * The resolved theme is stamped on the root element rather than left to a media
 * query, so an explicit Light or Dark choice overrides the operating system.
 */
export function createTheme({ onResolved }) {
    let choice = DEFAULT_THEME;

    function apply() {
        const resolved = resolveTheme(choice);
        document.documentElement.dataset.theme = resolved;
        onResolved(resolved);
    }

    // Only matters while following the system; an explicit choice ignores it.
    SYSTEM_DARK.addEventListener("change", () => {
        if (choice === "system") apply();
    });

    return {
        set(next) {
            choice = next;
            apply();
        },
    };
}
