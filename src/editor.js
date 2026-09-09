import { EditorState, Compartment } from '@codemirror/state';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { indentWithTab, history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { foldGutter, indentOnInput, indentUnit, bracketMatching, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, EditorView } from '@codemirror/view';

// Theme
import { oneDark } from "@codemirror/theme-one-dark";

// Language
import { dot } from "@viz-js/lang-dot";
import { dotCompletionSource } from "./completion.js";

const dotLanguage = dot();

// The theme is swapped at runtime by the selector, so it lives in a
// compartment rather than being baked into the initial state.
const themeCompartment = new Compartment();

const themeExtension = (resolved) => (resolved === "dark" ? oneDark : []);

function createEditorState(doc, { onChange, theme = "light" } = {}) {
    const extensions = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        // Tabs, matching the default document.
        indentUnit.of("\t"),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
            // Before indentWithTab: acceptCompletion declines when no
            // completion is open, so Tab falls through to indenting.
            { key: "Tab", run: acceptCompletion },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
        ]),
        themeCompartment.of(themeExtension(theme)),
        dotLanguage,
        // lang-dot ships no completion data of its own.
        dotLanguage.language.data.of({ autocomplete: dotCompletionSource }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    ];

    if (onChange) {
        extensions.push(EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange(update.state.doc.toString());
        }));
    }

    return EditorState.create({ doc, extensions });
}

export function createEditor({ parent, doc, onChange, theme }) {
    const view = new EditorView({
        state: createEditorState(doc, { onChange, theme }),
        parent,
    });

    return {
        getSource: () => view.state.doc.toString(),

        /** Swaps the editor theme without rebuilding the document or history. */
        setTheme(resolved) {
            view.dispatch({ effects: themeCompartment.reconfigure(themeExtension(resolved)) });
        },

        /**
         * Replaces the whole document. Goes through a normal transaction, so
         * the change is undoable and the onChange handler renders and saves it
         * like any other edit.
         */
        setSource(text) {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: text },
            });
        },
    };
}
