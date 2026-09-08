import { EditorState } from '@codemirror/state';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { indentWithTab, history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { foldGutter, indentOnInput, indentUnit, bracketMatching, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, EditorView } from '@codemirror/view';

// Theme
import { oneDark } from "@codemirror/theme-one-dark";

// Language
import { dot } from "@viz-js/lang-dot";

export function createEditorState(doc, { onChange, oneDarkTheme = false } = {}) {
    const extensions = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentUnit.of("    "),
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
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
        ]),
        dot(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    ];

    if (onChange) {
        extensions.push(EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange(update.state.doc.toString());
        }));
    }

    if (oneDarkTheme) extensions.push(oneDark);

    return EditorState.create({ doc, extensions });
}

export function createEditor({ parent, doc, onChange, oneDarkTheme }) {
    const view = new EditorView({
        state: createEditorState(doc, { onChange, oneDarkTheme }),
        parent,
    });

    return {
        view,
        getSource: () => view.state.doc.toString(),
    };
}
