import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { indentWithTab, history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { foldGutter, indentOnInput, indentUnit, bracketMatching, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { Decoration, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, EditorView } from '@codemirror/view';

// Theme
import { oneDark } from "@codemirror/theme-one-dark";

// Language
import { dot } from "@viz-js/lang-dot";
import { dotCompletionSource } from "./completion.js";
import { rangesForTitles } from "./source-map.js";

const dotLanguage = dot();

const setHighlight = StateEffect.define();

const highlightMark = Decoration.mark({ class: "cm-graph-highlight" });

/**
 * Marks every occurrence of whatever is selected in the graph.
 *
 * The marks are dropped on any document edit rather than mapped through it:
 * once the source changes the graph is about to be re-rendered anyway, and a
 * stale highlight pointing at moved text is worse than none.
 */
const highlightField = StateField.define({
    create: () => Decoration.none,
    update(marks, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(setHighlight)) {
                return Decoration.set(effect.value.map((r) => highlightMark.range(r.from, r.to)));
            }
        }
        return transaction.docChanged ? Decoration.none : marks.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
});

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
        highlightField,
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

        /**
         * Highlights every occurrence of the given graph titles and scrolls the
         * first into view. An empty list clears the highlight.
         */
        highlightTitles(titles) {
            const ranges = titles.length ? rangesForTitles(view.state, titles) : [];
            const effects = [setHighlight.of(ranges)];

            if (ranges.length) {
                effects.push(EditorView.scrollIntoView(ranges[0].from, { y: "center" }));
            }

            view.dispatch({
                effects,
                // Put the caret at the first hit so keyboard navigation follows,
                // without selecting the text and risking it being typed over.
                ...(ranges.length ? { selection: { anchor: ranges[0].from } } : {}),
            });

            return ranges.length;
        },

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
