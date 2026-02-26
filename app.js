const STORAGE_KEYS = {
  code: "html5-editor:code",
  autoRun: "html5-editor:autoRun",
  theme: "html5-editor:theme",
  wysiwyg: "html5-editor:wysiwyg",
  wrap: "html5-editor:wrap",
  layout: "html5-editor:layout",
  splitLeft: "html5-editor:splitLeft",
  splitTop: "html5-editor:splitTop",
  inspectorTarget: "html5-editor:inspectorTarget",
};

const APP_VERSION = "0.3.4";

const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 16px; }
      .card { max-width: 720px; margin: 0 auto; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; }
      button { padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; background: #0f172a; color: white; cursor: pointer; }
      button:hover { filter: brightness(1.05); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>HTML5 Editor</h1>
      <p>Edit the HTML on the left, then click <strong>Run</strong>.</p>
      <button onclick="document.body.style.background = '#fef3c7'">Test JS</button>
    </div>
  </body>
</html>
`;

function $(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: #${id}`);
  return element;
}

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delayMs);
  };
}

let statusHoldUntil = 0;
function setStatus(message, { holdMs = 0, force = true } = {}) {
  const now = Date.now();
  if (!force && now < statusHoldUntil) return;
  $("status").textContent = message;
  if (holdMs > 0) statusHoldUntil = now + holdMs;
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function getTheme() {
  const raw = safeStorageGet(STORAGE_KEYS.theme) || "light";
  if (raw === "dark" || raw === "light" || raw === "paper") return raw;
  return "light";
}

function setTheme(theme) {
  const normalized = theme === "paper" ? "paper" : theme === "light" ? "light" : "dark";
  safeStorageSet(STORAGE_KEYS.theme, normalized);

  document.body.classList.toggle("theme--light", normalized !== "dark");
  document.body.classList.toggle("theme--paper", normalized === "paper");
  setStatus(`Theme: ${getThemeLabel(normalized)}`);
}

function getThemeLabel(theme) {
  if (theme === "paper") return "Paper";
  if (theme === "light") return "Light";
  return "Dark";
}

function isLightTheme() {
  return document.body.classList.contains("theme--light");
}

function loadInitialCode() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (hash.startsWith("code=")) {
    try {
      return decodeURIComponent(hash.slice("code=".length));
    } catch {
      return DEFAULT_TEMPLATE;
    }
  }
  return safeStorageGet(STORAGE_KEYS.code) || DEFAULT_TEMPLATE;
}

function saveCode(code, { silent = false } = {}) {
  const ok = safeStorageSet(STORAGE_KEYS.code, code);
  if (ok && !silent) setStatus("Saved");
}

function parseHtmlDocument(html) {
  const parser = new DOMParser();
  return parser.parseFromString(String(html || ""), "text/html");
}

function findBodyBounds(fullHtml) {
  const html = String(fullHtml || "");
  const lower = html.toLowerCase();
  const openIdx = lower.indexOf("<body");
  if (openIdx === -1) return null;
  const openEnd = lower.indexOf(">", openIdx);
  if (openEnd === -1) return null;
  const closeIdx = lower.lastIndexOf("</body");
  if (closeIdx === -1 || closeIdx < openEnd) return null;
  return { html, openEnd: openEnd + 1, closeIdx };
}

function extractBodyInnerHtml(fullHtml) {
  try {
    const bounds = findBodyBounds(fullHtml);
    if (bounds) return bounds.html.slice(bounds.openEnd, bounds.closeIdx);
    const doc = parseHtmlDocument(fullHtml);
    return doc.body ? doc.body.innerHTML : "";
  } catch {
    return "";
  }
}

function replaceBodyInnerHtml(fullHtml, newBodyInnerHtml) {
  try {
    const nextBody = String(newBodyInnerHtml || "");
    const bounds = findBodyBounds(fullHtml);
    if (bounds) return bounds.html.slice(0, bounds.openEnd) + nextBody + bounds.html.slice(bounds.closeIdx);
    const doc = parseHtmlDocument(fullHtml);
    if (doc.body) doc.body.innerHTML = nextBody;
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch {
    return fullHtml;
  }
}

function setPreview(html, { announce = false } = {}) {
  const iframe = $("preview");
  iframe.srcdoc = html;
  if (announce) setStatus("Preview updated", { holdMs: 800 });
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function ensureTinyMCELoaded(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (globalThis.tinymce) return true;
    await new Promise((r) => window.setTimeout(r, 50));
  }
  return Boolean(globalThis.tinymce);
}

function getTinyMCEEditor() {
  if (!globalThis.tinymce) return null;
  return globalThis.tinymce.get("visualEditor") || null;
}

async function initTinyMCE({ onChange, shouldIgnoreChange, onUserEdit }) {
  if (!(await ensureTinyMCELoaded())) return false;
  if (getTinyMCEEditor()) return true;

  const useLight = isLightTheme();

  const baseConfig = {
    target: $("visualEditor"),
    menubar: false,
    branding: false,
    statusbar: false,
    resize: false,
    toolbar_mode: "wrap",
    skin: useLight ? "oxide" : "oxide-dark",
    content_css: useLight ? "default" : "dark",
    entity_encoding: "raw",
    convert_urls: false,
    valid_elements: "*[*]",
    content_style:
      "body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; }",
    fontsize_formats: "10px 12px 14px 16px 18px 20px 24px 28px 32px 40px 48px",
    font_family_formats:
      "System=system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;Arial=arial,helvetica,sans-serif;Georgia=georgia,palatino,serif;Times New Roman='Times New Roman',times,serif;Courier New='Courier New',courier,monospace",
    extended_valid_elements:
      "span[data-html5-icon|data-html5-icon-text|data-html5-icon-pos|data-html5-icon-size|data-html5-icon-color|contenteditable|aria-hidden|style]",
    setup: (ed) => {
      let ready = false;
      let lastHtml = null;
      ed.on("init", () => {
        ready = true;
        lastHtml = ed.getContent({ format: "html" });
      });

      const debounced = debounce(() => {
        if (!ready) return;
        if (typeof shouldIgnoreChange === "function" && shouldIgnoreChange()) return;
        onChange(ed);
      }, 120);

      const isLikelyUserEdit = (e) => {
        if (!e) return true;
        if (typeof e.isTrusted === "boolean" && e.isTrusted === false) return false;
        const cmd = (e.command || e.commandName || "").toString().toLowerCase();
        if (cmd.includes("setcontent")) return false;
        return true;
      };

      const userChange = (e) => {
        if (!ready) return;
        if (typeof shouldIgnoreChange === "function" && shouldIgnoreChange()) return;
        if (!isLikelyUserEdit(e)) return;
        const nowHtml = ed.getContent({ format: "html" });
        if (nowHtml === lastHtml) return;
        lastHtml = nowHtml;
        if (typeof onUserEdit === "function") onUserEdit();
        debounced();
      };

      ed.on("SetContent", () => {
        if (!ready) return;
        lastHtml = ed.getContent({ format: "html" });
      });
      ed.on("input paste ExecCommand undo redo", userChange);
    },
  };

  const richConfig = {
    ...baseConfig,
    plugins: "lists link table code fullscreen searchreplace visualblocks textcolor",
    toolbar:
      "undo redo | styles blocks | fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link table | removeformat | code fullscreen",
  };

  const fallbackConfig = {
    ...baseConfig,
    plugins: "lists link table code fullscreen searchreplace visualblocks",
    toolbar:
      "undo redo | blocks | bold italic underline | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link table | removeformat | code fullscreen",
  };

  try {
    await globalThis.tinymce.init(richConfig);
  } catch {
    await globalThis.tinymce.init(fallbackConfig);
  }

  return true;
}

  function destroyTinyMCE() {
    const ed = getTinyMCEEditor();
    if (!ed) return;
    globalThis.tinymce.remove(ed);
  }

function main() {
  const editor = $("editor");
  const runBtn = $("runBtn");
  const popoutBtn = $("popoutBtn");
  const wysiwygBtn = $("wysiwygBtn");
  const autoRunBtn = $("autoRunBtn");
  const wrapBtn = $("wrapBtn");
  const copyBtn = $("copyBtn");
  const downloadBtn = $("downloadBtn");
  const resetBtn = $("resetBtn");
  const layoutBtn = $("layoutBtn");
  const themeBtn = $("themeBtn");
  const divider = $("divider");
  const preview = $("preview");
  const visual = $("visual");
  const visualFallback = $("visualFallback");
  const elementInspector = $("elementInspector");
  const inspectorTitle = $("inspectorTitle");
  const inspectorMeta = $("inspectorMeta");
  const inspectorHint = $("inspectorHint");
  const insTargetSelected = $("insTargetSelected");
  const insTargetContainer = $("insTargetContainer");
  const insId = $("insId");
  const insClass = $("insClass");
  const insColor = $("insColor");
  const insColorClear = $("insColorClear");
  const insBg = $("insBg");
  const insBgClear = $("insBgClear");
  const insBgImage = $("insBgImage");
  const insBgImageClear = $("insBgImageClear");
  const insAlign = $("insAlign");
  const insDisplay = $("insDisplay");
  const insPad = $("insPad");
  const insRadius = $("insRadius");
  const insBorderW = $("insBorderW");
  const insBorderStyle = $("insBorderStyle");
  const insBorderColor = $("insBorderColor");
  const insBorderColorClear = $("insBorderColorClear");
  const gridControls = $("gridControls");
  const insGridCols = $("insGridCols");
  const insGridGap = $("insGridGap");
  const insIconText = $("insIconText");
  const insIconPos = $("insIconPos");
  const insIconSize = $("insIconSize");
  const insIconColor = $("insIconColor");
  const insIconRemove = $("insIconRemove");

  $("versionPill").textContent = `v${APP_VERSION}`;

  const debugEnabled =
    window.location.search.includes("debug=1") || safeStorageGet("html5-editor:debug") === "true";
  const debugLog = (...args) => {
    if (!debugEnabled) return;
    // eslint-disable-next-line no-console
    console.log("[html5-editor]", ...args);
  };

  function setPressed(btn, pressed) {
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  function setButtonLabel(btn, label) {
    const el = btn.querySelector(".btn__label");
    if (el) el.textContent = label;
    else btn.textContent = label;
  }

  function setButtonIcon(btn, symbolId) {
    const use = btn.querySelector("use");
    if (!use) return;
    use.setAttribute("href", `#${symbolId}`);
  }

  function isWysiwygEnabled() {
    return wysiwygBtn.getAttribute("aria-pressed") === "true";
  }

  function setWysiwygEnabled(enabled) {
    setPressed(wysiwygBtn, enabled);
    safeStorageSet(STORAGE_KEYS.wysiwyg, String(enabled));
  }

  function isAutoRunEnabled() {
    return autoRunBtn.getAttribute("aria-pressed") === "true";
  }

  function setAutoRunEnabled(enabled) {
    setPressed(autoRunBtn, enabled);
    safeStorageSet(STORAGE_KEYS.autoRun, String(enabled));
  }

  function updateThemeButton() {
    const t = getTheme();
    setButtonLabel(themeBtn, getThemeLabel(t));
    setButtonIcon(themeBtn, t === "dark" ? "i-moon" : t === "light" ? "i-sun" : "i-paper");
    themeBtn.title = `Theme: ${getThemeLabel(t)} (click to cycle)`;
  }

  setTheme(getTheme());
  updateThemeButton();

  const savedLayout = safeStorageGet(STORAGE_KEYS.layout) || "horizontal";
  document.body.classList.toggle("layout--vertical", savedLayout === "vertical");

  const state = {
    applyingFromVisual: false,
    applyingToVisual: false,
    lastAutoWrapAt: 0,
    updatingInspector: false,
    inspectorTarget: null,
    inspectorAttached: false,
    inspectorEventsInit: false,
    ignoreVisualSyncUntil: 0,
    visualCanWriteCode: false,
    visualDirty: false,
  };

  function isVerticalLayout() {
    return document.body.classList.contains("layout--vertical");
  }

  function updateLayoutButton() {
    const vertical = isVerticalLayout();
    setButtonLabel(layoutBtn, vertical ? "Stacked" : "Side-by-side");
    setButtonIcon(layoutBtn, vertical ? "i-stack" : "i-layout");
    layoutBtn.title = `Layout: ${vertical ? "Stacked" : "Side-by-side"} (click to toggle)`;
  }

  function updateDividerA11y() {
    divider.setAttribute("aria-orientation", isVerticalLayout() ? "horizontal" : "vertical");
  }

  function setModeUI() {
    const visualOn = isWysiwygEnabled();
    visual.hidden = !visualOn;
    preview.hidden = visualOn;
    elementInspector.hidden = !visualOn;
    if (!visualOn) state.inspectorTarget = null;
    if (!visualOn) state.inspectorAttached = false;
  }

  function setWrapEnabled(enabled, { persist = true, announce = true } = {}) {
    editor.classList.toggle("editor--wrap", enabled);
    editor.wrap = enabled ? "soft" : "off";
    setPressed(wrapBtn, enabled);
    if (persist) safeStorageSet(STORAGE_KEYS.wrap, String(enabled));
    if (announce) setStatus(enabled ? "Wrap enabled" : "Wrap disabled");
  }

  function enableWrapOnResizeIfNeeded() {
    if (editor.classList.contains("editor--wrap")) return;
    const now = Date.now();
    const shouldAnnounce = now - state.lastAutoWrapAt > 800;
    state.lastAutoWrapAt = now;
    setWrapEnabled(true, { persist: true, announce: shouldAnnounce });
  }

  function setEditorValue(nextValue, { preserveIfNotFocused = true } = {}) {
    const next = String(nextValue || "");
    if (editor.value === next) return;

    const preserve = preserveIfNotFocused && document.activeElement !== editor;
    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const scrollTop = editor.scrollTop;
    const scrollLeft = editor.scrollLeft;

    editor.value = next;

    if (preserve) {
      const max = editor.value.length;
      editor.scrollTop = scrollTop;
      editor.scrollLeft = scrollLeft;
      editor.setSelectionRange(Math.min(selectionStart, max), Math.min(selectionEnd, max));
    }
  }

  function renderPreviewFromCode({ announce = false } = {}) {
    setPreview(editor.value, { announce });
  }

  function rgbToHex(rgb) {
    const m = String(rgb || "").match(
      /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
    );
    if (!m) return null;
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return null;
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }

  function normalizeColorToHex(value) {
    const s = String(value || "").trim();
    if (!s) return null;
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      const r = s[1];
      const g = s[2];
      const b = s[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return rgbToHex(s);
  }

  function findOrCreateIconBadge(el) {
    const existing = el.querySelector("[data-html5-icon='true']");
    if (existing) return existing;
    const badge = el.ownerDocument.createElement("span");
    badge.setAttribute("data-html5-icon", "true");
    badge.setAttribute("contenteditable", "false");
    badge.setAttribute("aria-hidden", "true");
    badge.style.position = "absolute";
    badge.style.left = "0";
    badge.style.zIndex = "2";
    badge.style.pointerEvents = "none";
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.lineHeight = "0";
    el.insertBefore(badge, el.firstChild);
    return badge;
  }

  function getNumericPx(value) {
    const n = Number.parseFloat(String(value || ""));
    return Number.isFinite(n) ? n : null;
  }

  function setInlineStyleWithRestore(el, propName, nextPx, restoreKey) {
    const prev = el.style.getPropertyValue(propName);
    const restoreProp = `html5IconPrev${restoreKey}`;
    const restoreSet = `html5IconRestore${restoreKey}`;
    if (!el.dataset[restoreSet]) {
      el.dataset[restoreProp] = prev;
      el.dataset[restoreSet] = "true";
    }
    el.style.setProperty(propName, `${Math.round(nextPx)}px`);
  }

  function restoreInlineStyle(el, propName, restoreKey) {
    const restoreProp = `html5IconPrev${restoreKey}`;
    const restoreSet = `html5IconRestore${restoreKey}`;
    if (!el.dataset[restoreSet]) return;
    const prev = el.dataset[restoreProp] ?? "";
    if (prev) el.style.setProperty(propName, prev);
    else el.style.removeProperty(propName);
    delete el.dataset[restoreProp];
    delete el.dataset[restoreSet];
  }

  function applyIconBadge(el, { text, pos, sizePx, color }) {
    const cleanText = String(text || "").trim();
    const cleanPos = pos === "tl" || pos === "ml" || pos === "bl" ? pos : "ml";
    const cleanSize = Number.isFinite(sizePx) && sizePx > 0 ? Math.round(sizePx) : 18;
    const cleanColor = normalizeColorToHex(color) || "#111827";

    const existing = el.querySelector("[data-html5-icon='true']");
    if (!cleanText) {
      if (existing) existing.remove();
      restoreInlineStyle(el, "margin-left", "MarginLeft");
      restoreInlineStyle(el, "padding-left", "PaddingLeft");
      return;
    }

    const view = el.ownerDocument.defaultView || window;
    const cs = view.getComputedStyle(el);
    if (cs.position === "static" && !el.style.position) el.style.position = "relative";

    const requiredMarginLeft = 15;
    const computedMarginLeft = getNumericPx(cs.marginLeft) ?? 0;
    if (computedMarginLeft < requiredMarginLeft) {
      setInlineStyleWithRestore(el, "margin-left", requiredMarginLeft, "MarginLeft");
    }

    const requiredPaddingLeft = cleanSize + 18;
    const computedPaddingLeft = getNumericPx(cs.paddingLeft) ?? 0;
    if (computedPaddingLeft < requiredPaddingLeft) {
      setInlineStyleWithRestore(el, "padding-left", requiredPaddingLeft, "PaddingLeft");
    }

    const badge = findOrCreateIconBadge(el);
    badge.dataset.html5IconText = cleanText;
    badge.dataset.html5IconPos = cleanPos;
    badge.dataset.html5IconSize = String(cleanSize);
    badge.dataset.html5IconColor = cleanColor;
    badge.style.color = cleanColor;
    badge.style.width = `${cleanSize}px`;
    badge.style.height = `${cleanSize}px`;
    badge.style.fontSize = `${cleanSize}px`;
    badge.style.fontFamily =
      "'Segoe UI Symbol', 'Apple Color Emoji', 'Segoe UI Emoji', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

    // Position relative to the left border; keep icon centered on the border edge.
    badge.style.top = "";
    badge.style.bottom = "";
    badge.style.transform = "translate(-50%, -50%)";
    if (cleanPos === "tl") badge.style.top = "0";
    if (cleanPos === "ml") badge.style.top = "50%";
    if (cleanPos === "bl") badge.style.bottom = "0";
    if (cleanPos === "bl") badge.style.transform = "translate(-50%, 50%)";

    badge.textContent = cleanText;
  }

  function readIconBadge(el) {
    const badge = el.querySelector("[data-html5-icon='true']");
    if (!badge) return { text: "", pos: "ml", size: 18, color: "#111827" };
    const text = badge.dataset.html5IconText || badge.textContent || "";
    const pos = badge.dataset.html5IconPos || "ml";
    const size = Number.parseInt(badge.dataset.html5IconSize || "18", 10);
    const color = badge.dataset.html5IconColor || "#111827";
    return { text, pos, size: Number.isFinite(size) ? size : 18, color };
  }

  function setColorControl(input, clearBtn, cssValue) {
    const hex = normalizeColorToHex(cssValue);
    if (!hex) {
      input.dataset.unset = "true";
      clearBtn.disabled = true;
      return;
    }
    input.value = hex;
    input.dataset.unset = "false";
  }

  function getColorControlValue(input) {
    return input.dataset.unset === "true" ? null : input.value;
  }

  function parsePxNumber(value) {
    const m = String(value || "").trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function getInspectorTargetMode() {
    return safeStorageGet(STORAGE_KEYS.inspectorTarget) === "selected" ? "selected" : "container";
  }

  function setInspectorTargetMode(mode) {
    const normalized = mode === "selected" ? "selected" : "container";
    safeStorageSet(STORAGE_KEYS.inspectorTarget, normalized);
    setPressed(insTargetSelected, normalized === "selected");
    setPressed(insTargetContainer, normalized === "container");
    inspectorHint.textContent =
      normalized === "selected"
        ? "Click an element in the visual editor to select it, then adjust settings below."
        : "Click inside a block to edit its container (nearest div), then adjust settings below.";
    setInspectorTargetFromSelection();
  }

  function getSelectedElementTarget(ed) {
    const body = ed.getBody();
    let node = ed.selection.getNode();
    if (!node) return null;
    if (node.nodeType === 9 && node.body) node = node.body;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || node.nodeType !== 1) return null;
    if (!body || !body.contains(node)) return null;

    if (getInspectorTargetMode() === "selected") return node;

    const closestDiv = node.closest ? node.closest("div") : null;
    if (closestDiv && body.contains(closestDiv)) return closestDiv;
    return node;
  }

  function getInspectorTargetFromElement(ed, element) {
    if (!ed) return null;
    const body = ed.getBody();
    if (!body) return null;
    if (!element) return null;
    let el = element;
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || el.nodeType !== 1) return null;
    if (!body.contains(el)) return null;

    if (getInspectorTargetMode() === "selected") return el;

    const closestDiv = el.closest ? el.closest("div") : null;
    if (closestDiv && body.contains(closestDiv)) return closestDiv;
    return el;
  }

  function setStyleProp(el, propName, value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      el.style.removeProperty(propName);
      return;
    }
    el.style.setProperty(propName, String(value));
  }

  function setOrRemoveAttr(el, attrName, value) {
    const v = String(value || "").trim();
    if (!v) el.removeAttribute(attrName);
    else el.setAttribute(attrName, v);
  }

  function updateInspectorFromTarget(el) {
    if (!el) {
      inspectorTitle.textContent = "Element inspector";
      inspectorMeta.textContent = "Click in the visual editor to select an element";
      setInspectorFieldsEnabled(false);
      return;
    }

    const view = el.ownerDocument && el.ownerDocument.defaultView;
    const cs = view && typeof view.getComputedStyle === "function" ? view.getComputedStyle(el) : window.getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id") || "";
    const cls = el.getAttribute("class") || "";

    inspectorTitle.textContent = `${tag.toUpperCase()} settings`;
    const metaParts = [];
    if (id) metaParts.push(`#${id}`);
    if (cls) metaParts.push(`.${cls.split(/\s+/).filter(Boolean).join(".")}`);
    inspectorMeta.textContent = metaParts.join(" ");

    state.updatingInspector = true;
    setInspectorFieldsEnabled(true);
    insId.value = id;
    insClass.value = cls;

    setColorControl(insColor, insColorClear, el.style.color || cs.color);
    insColorClear.disabled = !el.style.color;

    setColorControl(insBg, insBgClear, el.style.backgroundColor || cs.backgroundColor);
    insBgClear.disabled = !el.style.backgroundColor;

    setColorControl(insBorderColor, insBorderColorClear, el.style.borderColor || cs.borderColor);
    insBorderColorClear.disabled = !el.style.borderColor;

    const bgImage = (el.style.backgroundImage || cs.backgroundImage || "").trim();
    const bgImageUnset = !bgImage || bgImage === "none";
    insBgImage.value = bgImageUnset ? "" : bgImage;
    insBgImageClear.disabled = bgImageUnset && !el.style.backgroundImage;

    insAlign.value = el.style.textAlign || cs.textAlign || "";
    insDisplay.value = el.style.display || cs.display || "";
    gridControls.hidden = (insDisplay.value || "") !== "grid";

    const pad = parsePxNumber(el.style.padding || cs.padding);
    insPad.value = pad === null ? "" : String(pad);

    const radius = parsePxNumber(el.style.borderRadius || cs.borderRadius);
    insRadius.value = radius === null ? "" : String(radius);

    const bw = parsePxNumber(el.style.borderWidth || cs.borderWidth);
    insBorderW.value = bw === null ? "" : String(bw);
    insBorderStyle.value = el.style.borderStyle || cs.borderStyle || "";

    const cols = String(el.style.gridTemplateColumns || cs.gridTemplateColumns || "").trim();
    const colsMatch = cols.match(/^repeat\(\s*(\d+)\s*,/i);
    insGridCols.value = colsMatch ? colsMatch[1] : "";

    const gap = parsePxNumber(el.style.gap || cs.gap);
    insGridGap.value = gap === null ? "" : String(gap);

    const icon = readIconBadge(el);
    insIconText.value = icon.text;
    insIconPos.value = icon.pos;
    insIconSize.value = String(icon.size);
    insIconColor.value = normalizeColorToHex(icon.color) || "#111827";
    const hasIcon = Boolean(String(icon.text || "").trim());
    insIconRemove.disabled = !hasIcon;
    insIconPos.disabled = !hasIcon;
    insIconSize.disabled = !hasIcon;
    insIconColor.disabled = !hasIcon;

    state.updatingInspector = false;
  }

  function setInspectorFieldsEnabled(enabled) {
    const controls = [
      insId,
      insClass,
      insColor,
      insColorClear,
      insBg,
      insBgClear,
      insBgImage,
      insBgImageClear,
      insAlign,
      insDisplay,
      insPad,
      insRadius,
      insBorderW,
      insBorderStyle,
      insBorderColor,
      insBorderColorClear,
      insGridCols,
      insGridGap,
      insIconText,
      insIconPos,
      insIconSize,
      insIconColor,
      insIconRemove,
    ];
    for (const c of controls) c.disabled = !enabled;
    gridControls.hidden = !enabled || (insDisplay.value || "") !== "grid";
    insIconRemove.disabled = !enabled || !String(insIconText.value || "").trim();
  }

  function applyInspectorToTarget() {
    if (state.updatingInspector) return;
    if (!isWysiwygEnabled()) return;
    const ed = getTinyMCEEditor();
    if (!ed) return;
    const el = state.inspectorTarget;
    if (!el || !ed.getBody().contains(el)) return;

    const display = String(insDisplay.value || "").trim();
    gridControls.hidden = display !== "grid";

    const hasIcon = Boolean(String(insIconText.value || "").trim());
    insIconRemove.disabled = !hasIcon;
    insIconPos.disabled = !hasIcon;
    insIconSize.disabled = !hasIcon;
    insIconColor.disabled = !hasIcon;

    ed.undoManager.transact(() => {
      setOrRemoveAttr(el, "id", insId.value);
      setOrRemoveAttr(el, "class", insClass.value);

      setStyleProp(el, "color", getColorControlValue(insColor));
      setStyleProp(el, "background-color", getColorControlValue(insBg));
      setStyleProp(el, "background-image", insBgImage.value.trim() === "" ? null : insBgImage.value.trim());
      setStyleProp(el, "text-align", insAlign.value);

      setStyleProp(el, "padding", insPad.value === "" ? null : `${Number(insPad.value)}px`);
      setStyleProp(el, "border-radius", insRadius.value === "" ? null : `${Number(insRadius.value)}px`);

      setStyleProp(el, "display", display);

      const bw = insBorderW.value === "" ? null : `${Number(insBorderW.value)}px`;
      setStyleProp(el, "border-width", bw);
      setStyleProp(el, "border-style", insBorderStyle.value);
      setStyleProp(el, "border-color", getColorControlValue(insBorderColor));

      if (display === "grid") {
        const cols = insGridCols.value === "" ? null : Number(insGridCols.value);
        const gap = insGridGap.value === "" ? null : Number(insGridGap.value);
        setStyleProp(
          el,
          "grid-template-columns",
          cols ? `repeat(${cols}, minmax(0, 1fr))` : null,
        );
        setStyleProp(el, "gap", gap === null ? null : `${gap}px`);
      } else {
        setStyleProp(el, "grid-template-columns", null);
        setStyleProp(el, "gap", null);
      }

      applyIconBadge(el, {
        text: String(insIconText.value || "").trim(),
        pos: String(insIconPos.value || "").trim(),
        sizePx: insIconSize.value === "" ? 18 : Number(insIconSize.value),
        color: insIconColor.value,
      });
    });

    ed.nodeChanged();
    state.visualCanWriteCode = true;
    syncCodeFromVisual(ed, { silent: true });
    setStatus("Element updated");
    updateInspectorFromTarget(el);
  }

  const applyInspectorDebounced = debounce(() => applyInspectorToTarget(), 120);

  function setInspectorTargetFromSelection() {
    if (!isWysiwygEnabled()) return;
    const ed = getTinyMCEEditor();
    if (!ed) return;
    const el = getSelectedElementTarget(ed);
    state.inspectorTarget = el;
    updateInspectorFromTarget(el);
  }

  function initInspectorEventsOnce() {
    if (state.inspectorEventsInit) return;
    state.inspectorEventsInit = true;

    const onAny = () => applyInspectorDebounced();
    insId.addEventListener("input", onAny);
    insClass.addEventListener("input", onAny);
    insAlign.addEventListener("change", onAny);
    insDisplay.addEventListener("change", onAny);
    insPad.addEventListener("change", onAny);
    insRadius.addEventListener("change", onAny);
    insBorderW.addEventListener("change", onAny);
    insBorderStyle.addEventListener("change", onAny);
    insGridCols.addEventListener("change", onAny);
    insGridGap.addEventListener("change", onAny);
    insBgImage.addEventListener("input", onAny);
    insIconText.addEventListener("input", onAny);
    insIconPos.addEventListener("change", onAny);
    insIconSize.addEventListener("change", onAny);
    insIconColor.addEventListener("input", onAny);
    insIconRemove.addEventListener("click", () => {
      insIconText.value = "";
      onAny();
    });

    insColor.addEventListener("input", () => {
      insColor.dataset.unset = "false";
      insColorClear.disabled = false;
      onAny();
    });
    insBg.addEventListener("input", () => {
      insBg.dataset.unset = "false";
      insBgClear.disabled = false;
      onAny();
    });
    insBorderColor.addEventListener("input", () => {
      insBorderColor.dataset.unset = "false";
      insBorderColorClear.disabled = false;
      onAny();
    });

    insColorClear.addEventListener("click", () => {
      insColor.dataset.unset = "true";
      insColorClear.disabled = true;
      onAny();
    });
    insBgClear.addEventListener("click", () => {
      insBg.dataset.unset = "true";
      insBgClear.disabled = true;
      onAny();
    });
    insBgImageClear.addEventListener("click", () => {
      insBgImage.value = "";
      insBgImageClear.disabled = true;
      onAny();
    });
    insBorderColorClear.addEventListener("click", () => {
      insBorderColor.dataset.unset = "true";
      insBorderColorClear.disabled = true;
      onAny();
    });

    insTargetSelected.addEventListener("click", () => setInspectorTargetMode("selected"));
    insTargetContainer.addEventListener("click", () => setInspectorTargetMode("container"));

    document.querySelectorAll("[data-icon-sample]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-icon-sample") || "";
        insIconText.value = v;
        applyInspectorDebounced();
      });
    });
  }

  function attachTinyMCEInspector(ed) {
    if (!ed || state.inspectorAttached) return;
    state.inspectorAttached = true;
    initInspectorEventsOnce();

    const scheduleFromSelection = () => {
      window.requestAnimationFrame(() => setInspectorTargetFromSelection());
    };

    ed.on("NodeChange SelectionChange keyup mouseup focus", () => scheduleFromSelection());

    ed.on("click", (e) => {
      const target = getInspectorTargetFromElement(ed, e.target);
      if (!target) return scheduleFromSelection();
      state.inspectorTarget = target;
      updateInspectorFromTarget(target);
    });

    setInspectorTargetFromSelection();
  }

  function destroyTinyMCEWithInspectorReset() {
    destroyTinyMCE();
    state.inspectorAttached = false;
    state.inspectorTarget = null;
    updateInspectorFromTarget(null);
  }

  function syncCodeFromVisual(ed, { silent = false } = {}) {
    if (state.applyingToVisual) return;
    if (!state.visualCanWriteCode) return;
    if (!ed) return;
    debugLog("visual->code sync");
    const body = ed.getContent({ format: "html" });
    const nextFull = replaceBodyInnerHtml(editor.value, body);
    state.applyingFromVisual = true;
    setEditorValue(nextFull, { preserveIfNotFocused: true });
    state.applyingFromVisual = false;
    state.visualDirty = false;
    saveCode(editor.value, { silent: true });
    if (!silent) setStatus("Updated from visual");
  }

  function flushVisualToCode({ silent = true } = {}) {
    if (!isWysiwygEnabled()) return;
    if (!state.visualDirty) return;
    const ed = getTinyMCEEditor();
    if (!ed) return;
    syncCodeFromVisual(ed, { silent });
  }

  async function syncVisualFromCode({ force }) {
    if (!isWysiwygEnabled()) return false;
    setModeUI();
    debugLog("code->visual sync", { force });

    const ok = await initTinyMCE({
      onChange: (ed) => syncCodeFromVisual(ed),
      shouldIgnoreChange: () => state.applyingToVisual || performance.now() < state.ignoreVisualSyncUntil,
      onUserEdit: () => {
        state.visualCanWriteCode = true;
        state.visualDirty = true;
        debugLog("visual user edit detected; enabling visual->code sync");
      },
    });

    if (!ok) {
      visualFallback.hidden = false;
      setWysiwygEnabled(false);
      setStatus("TinyMCE failed to load; switched to Preview");
      setModeUI();
      renderPreviewFromCode();
      return false;
    }

    visualFallback.hidden = true;
    const ed = getTinyMCEEditor();
    if (!ed) return false;
    attachTinyMCEInspector(ed);

    const body = extractBodyInnerHtml(editor.value);
    if (!force && ed.getContent({ format: "html" }) === body) return true;

    state.applyingToVisual = true;
    state.ignoreVisualSyncUntil = performance.now() + 400;
    state.visualCanWriteCode = false;
    ed.setContent(body);
    state.applyingToVisual = false;
    return true;
  }

  const syncVisualFromCodeDebounced = debounce(() => syncVisualFromCode({ force: false }), 200);
  const announceSavedDebounced = debounce(() => setStatus("Saved", { force: false }), 350);

  editor.value = loadInitialCode();
  setPressed(autoRunBtn, safeStorageGet(STORAGE_KEYS.autoRun) === "true");
  setPressed(wysiwygBtn, safeStorageGet(STORAGE_KEYS.wysiwyg) !== "false");
  const savedWrap = safeStorageGet(STORAGE_KEYS.wrap);
  setWrapEnabled(savedWrap === null ? true : savedWrap === "true", { persist: false, announce: false });

  updateLayoutButton();
  updateDividerA11y();
  setModeUI();
  setInspectorTargetMode(getInspectorTargetMode());
  setInspectorFieldsEnabled(false);

  if (isWysiwygEnabled()) {
    syncVisualFromCode({ force: true });
  } else {
    renderPreviewFromCode({ announce: false });
  }

  editor.addEventListener("input", () => {
    if (state.applyingFromVisual) return;
    state.visualCanWriteCode = false;
    state.visualDirty = false;
    saveCode(editor.value, { silent: true });
    announceSavedDebounced();
    if (!isAutoRunEnabled()) return;
    if (isWysiwygEnabled()) syncVisualFromCodeDebounced();
    else renderPreviewFromCode({ announce: false });
  });

  editor.addEventListener("paste", () => {
    if (!isAutoRunEnabled()) return;
    if (!isWysiwygEnabled()) return;
    window.setTimeout(() => {
      setStatus("Updating visual…", { holdMs: 800 });
      syncVisualFromCode({ force: true }).then((ok) => {
        if (ok) setStatus("Visual updated from code", { holdMs: 800 });
      });
    }, 0);
  });

  runBtn.addEventListener("click", async () => {
    if (isWysiwygEnabled()) {
      await syncVisualFromCode({ force: true });
      setStatus("Visual updated from code", { holdMs: 800 });
    } else {
      renderPreviewFromCode({ announce: true });
    }
  });

  popoutBtn.addEventListener("click", () => {
    flushVisualToCode();
    const blob = new Blob([editor.value], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) setStatus("Popout blocked by browser", { holdMs: 1200 });
    else setStatus("Opened in new tab", { holdMs: 800 });
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  autoRunBtn.addEventListener("click", () => {
    const next = !isAutoRunEnabled();
    setAutoRunEnabled(next);
    setStatus(next ? "Auto-run enabled" : "Auto-run disabled", { holdMs: 800 });
    if (!next) return;
    if (isWysiwygEnabled()) syncVisualFromCode({ force: false });
    else renderPreviewFromCode();
  });

  wysiwygBtn.addEventListener("click", async () => {
    const next = !isWysiwygEnabled();
    setWysiwygEnabled(next);
    setModeUI();
    if (next) {
      setStatus("Visual mode enabled", { holdMs: 800 });
      await syncVisualFromCode({ force: true });
    } else {
      flushVisualToCode();
      destroyTinyMCEWithInspectorReset();
      setStatus("Preview mode enabled", { holdMs: 800 });
      renderPreviewFromCode();
    }
  });

  wrapBtn.addEventListener("click", () => {
    const next = !editor.classList.contains("editor--wrap");
    setWrapEnabled(next, { persist: true, announce: true });
  });

  copyBtn.addEventListener("click", async () => {
    try {
      flushVisualToCode();
      await copyToClipboard(editor.value);
      setStatus("Copied", { holdMs: 800 });
    } catch {
      setStatus("Copy failed", { holdMs: 1200 });
    }
  });

  downloadBtn.addEventListener("click", () => {
    flushVisualToCode();
    downloadHtml("index.html", editor.value);
    setStatus("Downloaded index.html", { holdMs: 800 });
  });

  resetBtn.addEventListener("click", async () => {
    const ok = window.confirm("Reset the editor to the default template?");
    if (!ok) return;
    destroyTinyMCEWithInspectorReset();
    editor.value = DEFAULT_TEMPLATE;
    saveCode(editor.value);
    if (isWysiwygEnabled()) await syncVisualFromCode({ force: true });
    else renderPreviewFromCode({ announce: true });
  });

  layoutBtn.addEventListener("click", () => {
    const nextVertical = !isVerticalLayout();
    document.body.classList.toggle("layout--vertical", nextVertical);
    safeStorageSet(STORAGE_KEYS.layout, nextVertical ? "vertical" : "horizontal");
    updateLayoutButton();
    updateDividerA11y();
    enableWrapOnResizeIfNeeded();
    setStatus(nextVertical ? "Layout: stacked" : "Layout: side-by-side", { holdMs: 800 });
  });

  themeBtn.addEventListener("click", async () => {
    flushVisualToCode();
    const current = getTheme();
    const next = current === "dark" ? "light" : current === "light" ? "paper" : "dark";
    setTheme(next);
    updateThemeButton();
    if (isWysiwygEnabled()) {
      destroyTinyMCEWithInspectorReset();
      await syncVisualFromCode({ force: true });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runBtn.click();
    }

    if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      flushVisualToCode();
      downloadHtml("index.html", editor.value);
      setStatus("Downloaded index.html");
    }
  });

  (function setupDivider() {
    const savedLeft = safeStorageGet(STORAGE_KEYS.splitLeft);
    if (savedLeft) document.documentElement.style.setProperty("--split-left", savedLeft);
    const savedTop = safeStorageGet(STORAGE_KEYS.splitTop);
    if (savedTop) document.documentElement.style.setProperty("--split-top", savedTop);

    const layout = document.querySelector(".layout");
    if (!layout) return;

    let dragging = false;

      function setSplitFromPointer(clientX, clientY) {
        const rect = layout.getBoundingClientRect();
        enableWrapOnResizeIfNeeded();
        if (isVerticalLayout()) {
          const minTopPx = 160;
          const minBottomPx = 260;
          const maxTopPx = Math.min(rect.height * 0.35, rect.height - minBottomPx);
          const cappedMaxTopPx = Math.max(minTopPx, maxTopPx);
          const y = Math.min(Math.max(clientY - rect.top, minTopPx), cappedMaxTopPx);
          const pct = (y / rect.height) * 100;
          const value = `${pct.toFixed(1)}%`;
          document.documentElement.style.setProperty("--split-top", value);
          safeStorageSet(STORAGE_KEYS.splitTop, value);
        } else {
        const x = Math.min(Math.max(clientX - rect.left, 320), rect.width - 320);
        const pct = (x / rect.width) * 100;
        const value = `${pct.toFixed(1)}%`;
        document.documentElement.style.setProperty("--split-left", value);
        safeStorageSet(STORAGE_KEYS.splitLeft, value);
      }
    }

    divider.addEventListener("pointerdown", (e) => {
      if (window.matchMedia("(max-width: 980px)").matches) return;
      dragging = true;
      divider.setPointerCapture(e.pointerId);
      setSplitFromPointer(e.clientX, e.clientY);
      setStatus("Resizing panes...");
    });

    divider.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      setSplitFromPointer(e.clientX, e.clientY);
    });

    function stopDrag() {
      if (!dragging) return;
      dragging = false;
      setStatus("Pane size saved");
    }

    divider.addEventListener("pointerup", stopDrag);
    divider.addEventListener("pointercancel", stopDrag);

    divider.addEventListener("dblclick", () => {
      if (isVerticalLayout()) {
        document.documentElement.style.removeProperty("--split-top");
        safeStorageSet(STORAGE_KEYS.splitTop, "");
      } else {
        document.documentElement.style.removeProperty("--split-left");
        safeStorageSet(STORAGE_KEYS.splitLeft, "");
      }
      setStatus("Pane size reset");
    });

      divider.addEventListener("keydown", (e) => {
        if (isVerticalLayout()) {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          const current =
            getComputedStyle(document.documentElement).getPropertyValue("--split-top").trim() || "35%";
          const curPct = Number.parseFloat(current);
          if (Number.isNaN(curPct)) return;
          const next = e.key === "ArrowUp" ? curPct - 2 : curPct + 2;
          const value = `${Math.min(Math.max(next, 15), 35)}%`;
          document.documentElement.style.setProperty("--split-top", value);
          safeStorageSet(STORAGE_KEYS.splitTop, value);
          setStatus("Pane size saved");
        } else {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const current =
          getComputedStyle(document.documentElement).getPropertyValue("--split-left").trim() || "50%";
        const curPct = Number.parseFloat(current);
        if (Number.isNaN(curPct)) return;
        const next = e.key === "ArrowLeft" ? curPct - 2 : curPct + 2;
        const value = `${Math.min(Math.max(next, 20), 80)}%`;
        document.documentElement.style.setProperty("--split-left", value);
        safeStorageSet(STORAGE_KEYS.splitLeft, value);
        setStatus("Pane size saved");
      }
    });
  })();

  window.addEventListener(
    "resize",
    debounce(() => {
      enableWrapOnResizeIfNeeded();
    }, 200),
  );
}

main();
