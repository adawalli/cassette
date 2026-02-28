// ==UserScript==
// @name         Teams Transcript Export
// @namespace    https://github.com/adawalli/cassette
// @version      1.0.0
// @description  Export Microsoft Teams meeting transcripts as JSON for cassette processing
// @match        *://teams.microsoft.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const SCROLL_STEP = 600;
  const SCROLL_PAUSE_MS = 300;
  const SCROLL_IDLE_LIMIT = 3;
  const OBSERVER_DEBOUNCE_MS = 2000;

  let exportButton = null;

  // --- Timestamp + speaker parsing ---

  // aria-label formats:
  //   "Speaker Name N seconds"
  //   "Speaker Name N minutes N seconds"
  //   "Speaker Name N hour N minutes N seconds"
  //   "Speaker Name N hours N minutes N seconds"
  const ARIA_LABEL_RE =
    /^(.+?)\s+(?:(\d+)\s+hours?\s+)?(?:(\d+)\s+minutes?\s+)?(\d+)\s+seconds?$/;

  function parseAriaLabel(label) {
    const match = label.match(ARIA_LABEL_RE);
    if (!match) return null;

    const speaker = match[1].trim();
    const hours = match[2] ? parseInt(match[2], 10) : 0;
    const minutes = (match[3] ? parseInt(match[3], 10) : 0) + hours * 60;
    const seconds = parseInt(match[4], 10);

    return { speaker, minutes, seconds };
  }

  // --- DOM extraction ---

  // Collects entries into a map keyed by data-list-index so we can gather
  // them incrementally as the virtualizer recycles DOM nodes during scrolling.
  function collectVisibleEntries(collected) {
    const cells = document.querySelectorAll("div.ms-List-cell[data-list-index]");

    for (const cell of cells) {
      const index = parseInt(cell.getAttribute("data-list-index"), 10);
      if (collected.has(index)) continue;

      const baseEntry = cell.querySelector("div[class*='baseEntry'][aria-label]");
      if (!baseEntry) continue;

      const ariaLabel = baseEntry.getAttribute("aria-label")?.trim();
      if (!ariaLabel) continue;

      const parsed = parseAriaLabel(ariaLabel);
      if (!parsed) continue;

      const textEl = cell.querySelector("div[id^='sub-entry-']");
      if (!textEl) continue;

      const text = textEl.textContent.trim();
      if (!text) continue;

      collected.set(index, { index, ...parsed, text });
    }
  }

  function getSortedEntries(collected) {
    return [...collected.values()].sort((a, b) => a.index - b.index);
  }

  // --- JSON generation ---

  function generateJson(entries) {
    return JSON.stringify(
      entries.map(({ speaker, text }) => ({ speaker, text })),
      null,
      2
    );
  }

  // --- Auto-scroll to load all virtualized items ---

  function getScrollContainer() {
    return document.querySelector(
      "div#OneTranscript [data-is-scrollable='true']"
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function scrollAndCollect(onProgress) {
    const container = getScrollContainer();
    if (!container) {
      throw new Error("Could not find transcript scroll container");
    }

    const collected = new Map();

    // Scroll to top first and collect initial entries
    container.scrollTop = 0;
    await sleep(SCROLL_PAUSE_MS);
    collectVisibleEntries(collected);

    let maxScrollTop = 0;
    let bottomReachedCount = 0;

    while (true) {
      // If the virtualizer bounced us back, jump near our previous max
      // instead of slowly re-scrolling through already-collected entries
      if (container.scrollTop < maxScrollTop - SCROLL_STEP) {
        container.scrollTop = maxScrollTop - SCROLL_STEP;
        await sleep(SCROLL_PAUSE_MS);
      }

      container.scrollTop += SCROLL_STEP;
      await sleep(SCROLL_PAUSE_MS);

      maxScrollTop = Math.max(maxScrollTop, container.scrollTop);

      collectVisibleEntries(collected);
      onProgress?.(collected.size);

      const atBottom =
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - 10;

      bottomReachedCount = atBottom ? bottomReachedCount + 1 : 0;

      if (bottomReachedCount >= SCROLL_IDLE_LIMIT) break;
    }

    // Final collection pass
    collectVisibleEntries(collected);
    return collected;
  }

  // --- File download ---

  function downloadJson(content, filename) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function getMeetingTitle() {
    const span = document.querySelector('h2[data-tid="chat-title"] span[title]');
    return span ? span.getAttribute("title").trim() : "";
  }

  // Parses the meeting date from the tooltip or span text near the recap header.
  // Tooltip format: "Wednesday, February 11, 2026 2:00 PM -  2:30 PM"
  // Span fallback:  "Wednesday, February 11"
  function getMeetingDate() {
    const pad = (n) => String(n).padStart(2, "0");

    // Try the tooltip first - it has the full date with year and time
    const dateSpan = document.querySelector(
      '[data-tid="intelligent-recap-header"] span[aria-describedby^="tooltip-"]'
    );
    if (dateSpan) {
      const tooltipId = dateSpan.getAttribute("aria-describedby");
      const tooltip = tooltipId && document.getElementById(tooltipId);
      if (tooltip) {
        const parsed = new Date(tooltip.textContent.split(/\s+-\s+/)[0].trim());
        if (!isNaN(parsed)) {
          return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
        }
      }

      // Fall back to span text: "Wednesday, February 11" (no year)
      const spanText = dateSpan.textContent.trim();
      // Strip leading day name: "Wednesday, February 11" -> "February 11"
      const withoutDay = spanText.replace(/^\w+,\s*/, "");
      const parsed = new Date(`${withoutDay}, ${new Date().getFullYear()}`);
      if (!isNaN(parsed)) {
        return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
      }
    }

    // Final fallback: today's date
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function getFilename() {
    const title = getMeetingTitle();
    const slug = title ? slugify(title) : "teams-transcript";
    const dateStr = getMeetingDate();
    return `${dateStr} ${slug}.meeting.json`;
  }

  // --- Button UI ---

  const BUTTON_STATES = {
    ready:      { text: "Export Transcript",                disabled: false, color: "#6264a7" },
    scrolling:  { text: (n) => `Scrolling... (${n || 0} entries)`, disabled: true,  color: "#8b8cc7" },
    extracting: { text: "Extracting...",                    disabled: true,  color: "#8b8cc7" },
    done:       { text: (n) => `Exported ${n} entries`,    disabled: true,  color: "#4caf50", resetMs: 2000 },
    error:      { text: (msg) => `Error: ${msg}`,          disabled: true,  color: "#f44336", resetMs: 3000 },
  };

  function setButtonState(state, detail) {
    if (!exportButton) return;

    const cfg = BUTTON_STATES[state];
    exportButton.textContent = typeof cfg.text === "function" ? cfg.text(detail) : cfg.text;
    exportButton.disabled = cfg.disabled;
    exportButton.style.backgroundColor = cfg.color;

    if (cfg.resetMs) {
      setTimeout(() => setButtonState("ready"), cfg.resetMs);
    }
  }

  function createButton() {
    if (exportButton) return;

    exportButton = document.createElement("button");
    exportButton.id = "cassette-export";
    Object.assign(exportButton.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "99999",
      padding: "10px 20px",
      backgroundColor: "#6264a7",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "14px",
      fontFamily: "'Segoe UI', sans-serif",
      fontWeight: "600",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    });

    setButtonState("ready");

    exportButton.addEventListener("click", handleExport);
    document.body.appendChild(exportButton);
  }

  function removeButton() {
    if (exportButton) {
      exportButton.remove();
      exportButton = null;
    }
  }

  // --- Export handler ---

  async function handleExport() {
    try {
      setButtonState("scrolling", 0);
      const collected = await scrollAndCollect((count) => setButtonState("scrolling", count));

      const entries = getSortedEntries(collected);

      if (entries.length === 0) {
        setButtonState("error", "No entries found");
        return;
      }

      const json = generateJson(entries);
      downloadJson(json, getFilename());
      setButtonState("done", entries.length);
    } catch (err) {
      console.error("[cassette-export]", err);
      setButtonState("error", err.message);
    }
  }

  // --- SPA detection via MutationObserver ---

  function checkForTranscript() {
    document.querySelector("div#OneTranscript") ? createButton() : removeButton();
  }

  // Initial check
  checkForTranscript();

  // Watch for SPA navigation / transcript panel open/close
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkForTranscript, OBSERVER_DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
