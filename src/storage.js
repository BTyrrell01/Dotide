const DOCUMENT_KEY = "dotide:document";
const ENGINE_KEY = "dotide:engine";

/**
 * localStorage throws rather than returning null in some configurations
 * (Safari private browsing, storage disabled by policy), so every access is
 * guarded. Losing persistence is not worth breaking the editor over.
 */
function read(key, fallback) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch (err) {
        console.warn(`Could not read ${key}:`, err);
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.warn(`Could not save ${key}:`, err);
    }
}

export const loadDocument = (fallback) => read(DOCUMENT_KEY, fallback);
export const saveDocument = (text) => write(DOCUMENT_KEY, text);

export const loadEngine = (fallback) => read(ENGINE_KEY, fallback);
export const saveEngine = (engine) => write(ENGINE_KEY, engine);
