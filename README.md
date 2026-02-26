# HTML5 Editor (Simple)

A tiny, dependency-free HTML5 editor with live preview (similar to html5-editor.net, but minimal).

## Run

- Open `index.html` in a browser.
- Type HTML in the left panel.
- Click **Run** (or press `Ctrl+Enter`) to update the right pane.
- Use the top bar for global actions (Run, WYSIWYG, Auto-run, Layout, Theme).
- Use the Editor pane tools for code actions (Wrap, Copy, Download).
- Use **Popout** to open the HTML in a new tab.
- Enable **WYSIWYG** to edit the document body with TinyMCE; edits sync back into the code editor.
- Click **Layout** to toggle side-by-side vs stacked panes.
- Code editor wrapping auto-enables when you resize panes (and can still be toggled with **Wrap**).

## Notes

- Your HTML is saved in `localStorage`.
- Preview mode runs in a sandboxed `<iframe>`; scripts are allowed, but they still run on the same JS thread as the page (an infinite loop can freeze the tab).
- WYSIWYG uses TinyMCE loaded from a CDN, so it requires an internet connection (or vendoring TinyMCE locally).
- Theme defaults to `Light` and cycles `Dark` → `Light` → `Paper`.
- In WYSIWYG mode, use the TinyMCE toolbar to apply font/size/text color/background color to the current selection; changes sync back into the HTML.
- In WYSIWYG mode, the Element inspector lets you edit the selected element’s `id`, `class`, and inline styles (colors, border, padding, display/grid).
- Element inspector targeting: use `Selected` to style the exact selected element, or `Container` to style the nearest wrapping `div`.
- Background gradients: use “Background image / gradient” (e.g. `linear-gradient(...)`) to set `background-image` inline on the targeted element.
- Icon badge: enter a unicode symbol (or click a sample) and choose position/color/size; it auto-adds ~`15px` left margin and extra left padding so text doesn’t overlap (stored inline in the HTML).
- Pasting into the left code editor never rewrites your HTML; the visual editor only syncs back when you actually edit in WYSIWYG.

## Potential improvements

- Use a real code editor (CodeMirror/Monaco) for syntax highlighting and better editing.
- Split HTML/CSS/JS into separate tabs/panes and stitch into the preview.
- Add a formatter (Prettier) and HTML validation/linting.
- Add find/replace and/or HTML outline navigation.
