# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A minimal, zero-build HTML5 editor with live preview and WYSIWYG editing via TinyMCE (CDN-loaded). No bundler, no framework — just vanilla HTML/CSS/JS served as static files.

## Running

Open `index.html` in a browser. No build step, no dev server required. Append `?debug=1` to the URL for sync logging in the console.

## Architecture

The entire app lives in three files:

- **`index.html`** — Shell markup including an inline SVG icon sprite, the toolbar, a raw `<textarea>` code editor, a TinyMCE-powered visual editor with an Element Inspector panel, and a sandboxed `<iframe>` preview.
- **`app.js`** — All application logic in a single IIFE-style script (~900 lines). Key subsystems:
  - **State & persistence** — Toggle states (auto-run, theme, WYSIWYG, wrap, layout, split positions, inspector target) stored in `localStorage` under `html5-editor:*` keys. User HTML is also persisted.
  - **Preview rendering** — Writes full HTML documents into the sandboxed iframe via `srcdoc`.
  - **WYSIWYG sync** — Two-way sync between the raw `<textarea>` and TinyMCE. Direction flags (`SOURCE_WRITE` / `VISUAL_WRITE`) prevent echo loops. TinyMCE is configured to preserve all inline styles and attributes. `<head>` CSS is extracted and injected into TinyMCE's iframe so visual editing reflects the document's styles.
  - **Element Inspector** — When WYSIWYG is active, clicking an element populates inspector fields (id, class, colors, border, padding, display/grid, icon badge). Changes write inline styles back into TinyMCE content and sync to source.
  - **Resizable split** — Pointer-drag on the divider sets CSS custom properties (`--split-left` / `--split-top`) for the CSS Grid layout.
  - **Theme cycling** — Dark → Light → Paper, applied via `body.theme--light` / `body.theme--paper` classes.
- **`styles.css`** — All styling using CSS custom properties for theming. Layout uses CSS Grid with `minmax()` columns. Three theme variants defined at the top (`:root` = dark, `.theme--light`, `.theme--paper`). BEM-ish class naming throughout.

## Key Conventions

- Version is tracked manually in `APP_VERSION` constant at the top of `app.js`.
- DOM element access uses a `$(id)` helper that throws on missing elements — all IDs referenced in JS must exist in the HTML.
- No external JS dependencies besides TinyMCE (loaded from CDN). No npm/node tooling.
- The WYSIWYG editor only operates on `<body>` content; `<head>` styles are extracted separately and injected into TinyMCE's content CSS.
- The default HTML template is defined as a template literal (`DEFAULT_TEMPLATE`) in `app.js`.
