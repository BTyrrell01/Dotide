const KEY = "dotide:document";

/**
 * localStorage throws rather than returning null in some configurations
 * (Safari private browsing, storage disabled by policy), so every access is
 * guarded. Losing persistence is not worth breaking the editor over.
 */
export function loadDocument(fallback) {
    try {
        return localStorage.getItem(KEY) ?? fallback;
    } catch (err) {
        console.warn("Could not read saved document:", err);
        return fallback;
    }
}

export function saveDocument(text) {
    try {
        localStorage.setItem(KEY, text);
    } catch (err) {
        console.warn("Could not save document:", err);
    }
}
