(() => {
  const state = {
    mode: "lawn",
    imageDataUrl: null, // full-size-ish, resized for display/upload
    thumbDataUrl: null, // small, for history storage
  };

  const el = {
    tabs: document.querySelectorAll(".tab"),
    panels: {
      scan: document.getElementById("tab-scan"),
      history: document.getElementById("tab-history"),
    },
    modeBtns: document.querySelectorAll(".mode-btn"),
    modeHint: document.getElementById("modeHint"),
    cameraInput: document.getElementById("cameraInput"),
    fileInput: document.getElementById("fileInput"),
    previewImg: document.getElementById("previewImg"),
    previewPlaceholder: document.getElementById("previewPlaceholder"),
    previewWrap: document.getElementById("previewWrap"),
    notesInput: document.getElementById("notesInput"),
    identifyBtn: document.getElementById("identifyBtn"),
    resultArea: document.getElementById("resultArea"),
    historyList: document.getElementById("historyList"),
    historyEmpty: document.getElementById("historyEmpty"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsModal: document.getElementById("settingsModal"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    modelSelect: document.getElementById("modelSelect"),
    toast: document.getElementById("toast"),
  };

  const MODE_HINTS = {
    lawn: "Photograph a patch of lawn that looks off — bare spots, discoloration, strange growth, or weeds in the grass.",
    bed: "Photograph a plant growing in your flower bed that you suspect is a weed or volunteer you didn't plant.",
  };

  // ---------- Tabs ----------
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      Object.values(el.panels).forEach((p) => p.classList.remove("active"));
      el.panels[tab.dataset.tab].classList.add("active");
      if (tab.dataset.tab === "history") renderHistory();
    });
  });

  // ---------- Mode switch ----------
  el.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      el.modeBtns.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      state.mode = btn.dataset.mode;
      el.modeHint.textContent = MODE_HINTS[state.mode];
    });
  });

  // ---------- Image capture ----------
  el.cameraInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
  el.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.imageDataUrl = resizeImage(img, 1280, 0.85);
        state.thumbDataUrl = resizeImage(img, 220, 0.7);
        el.previewImg.src = state.imageDataUrl;
        el.previewImg.hidden = false;
        el.previewPlaceholder.hidden = true;
        el.previewWrap.classList.remove("empty");
        el.identifyBtn.disabled = false;
        el.resultArea.hidden = true;
        el.resultArea.innerHTML = "";
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function resizeImage(img, maxDim, quality) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  }

  function dataUrlToBase64(dataUrl) {
    const [meta, data] = dataUrl.split(",");
    const mediaType = meta.match(/data:(.*);base64/)[1];
    return { mediaType, data };
  }

  // ---------- Identify ----------
  el.identifyBtn.addEventListener("click", async () => {
    if (!state.imageDataUrl) return;
    const apiKey = Storage.getApiKey();
    if (!apiKey) {
      showToast("Add your Anthropic API key in Settings first.");
      openSettings();
      return;
    }

    el.identifyBtn.disabled = true;
    el.resultArea.hidden = false;
    el.resultArea.innerHTML = `<div class="loading"><span class="spinner"></span> Identifying and looking up removal info…</div>`;

    try {
      const { mediaType, data } = dataUrlToBase64(state.imageDataUrl);
      const diagnosis = await LawnAPI.identify({
        base64Image: data,
        mediaType,
        mode: state.mode,
        notes: el.notesInput.value,
        apiKey,
        model: Storage.getModel(),
      });
      renderResult(diagnosis);
      Storage.addHistoryEntry({
        id: `${Date.now()}`,
        date: new Date().toISOString(),
        mode: state.mode,
        thumb: state.thumbDataUrl,
        notes: el.notesInput.value.trim(),
        diagnosis,
      });
    } catch (err) {
      el.resultArea.innerHTML = `<div class="error-card">⚠️ ${escapeHtml(err.message || "Something went wrong.")}</div>`;
    } finally {
      el.identifyBtn.disabled = false;
    }
  });

  function renderResult(d) {
    const badgeClass = d.confidence === "low" ? "unsure" : (d.is_weed_or_unwanted ? "weed" : "ok");
    const badgeText = d.is_weed_or_unwanted ? "Remove" : (d.category === "desirable_plant" ? "Keep" : d.category.replace(/_/g, " "));

    el.resultArea.innerHTML = `
      <div class="result-card">
        <div class="result-title-row">
          <div>
            <p class="result-title">${escapeHtml(d.name)}</p>
            <p class="result-sub">${escapeHtml(d.category.replace(/_/g, " "))}</p>
          </div>
          <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
        </div>
        <p class="confidence">Confidence: ${escapeHtml(d.confidence)}</p>

        <div class="result-section">
          <h3>Summary</h3>
          <p>${escapeHtml(d.summary)}</p>
        </div>

        <div class="result-section">
          <h3>Why it looks like this</h3>
          <p>${escapeHtml(d.identification_notes)}</p>
        </div>

        ${listSection("Organic / non-chemical remedy", d.remedy_organic)}
        ${listSection("Chemical options", d.remedy_chemical)}
        ${listSection("Prevention", d.prevention)}

        <div class="result-section">
          <h3>Best timing</h3>
          <p>${escapeHtml(d.timing)}</p>
        </div>

        ${d.safety_notes ? `<div class="safety-note">⚠️ ${escapeHtml(d.safety_notes)}</div>` : ""}
        ${sourcesSection(d.sources)}
      </div>
    `;
  }

  function sourcesSection(sources) {
    const safe = (sources || []).filter((s) => isHttpUrl(s.url));
    if (!safe.length) return "";
    return `
      <div class="result-section">
        <h3>Sources</h3>
        <ul class="sources-list">
          ${safe.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title || s.url)}</a></li>`).join("")}
        </ul>
      </div>
    `;
  }

  function isHttpUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function listSection(title, items) {
    if (!items || !items.length) return "";
    return `
      <div class="result-section">
        <h3>${escapeHtml(title)}</h3>
        <ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      </div>
    `;
  }

  // ---------- History ----------
  function renderHistory() {
    const items = Storage.getHistory();
    el.historyEmpty.hidden = items.length > 0;
    el.historyList.innerHTML = items.map((item) => {
      const d = item.diagnosis;
      const dateStr = new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return `
        <button class="history-item" data-id="${item.id}">
          <img src="${item.thumb}" alt="" />
          <div class="hi-body">
            <div class="hi-title">${escapeHtml(d.name)}</div>
            <div class="hi-meta"><span class="mode-tag">${item.mode === "bed" ? "Flower bed" : "Lawn"}</span> · ${dateStr} · ${escapeHtml(d.confidence)} confidence</div>
          </div>
        </button>
      `;
    }).join("");

    el.historyList.querySelectorAll(".history-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((i) => i.id === btn.dataset.id);
        if (!item) return;
        el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === "scan"));
        el.panels.scan.classList.add("active");
        el.panels.history.classList.remove("active");
        state.imageDataUrl = item.thumb;
        el.previewImg.src = item.thumb;
        el.previewImg.hidden = false;
        el.previewPlaceholder.hidden = true;
        el.previewWrap.classList.remove("empty");
        el.notesInput.value = item.notes || "";
        el.resultArea.hidden = false;
        renderResult(item.diagnosis);
      });
    });
  }

  el.clearHistoryBtn.addEventListener("click", () => {
    if (!confirm("Clear all saved scans? This can't be undone.")) return;
    Storage.clearHistory();
    renderHistory();
  });

  // ---------- Settings ----------
  function openSettings() {
    el.apiKeyInput.value = Storage.getApiKey();
    el.modelSelect.value = Storage.getModel();
    el.settingsModal.hidden = false;
  }
  function closeSettings() { el.settingsModal.hidden = true; }

  el.settingsBtn.addEventListener("click", openSettings);
  el.closeSettingsBtn.addEventListener("click", closeSettings);
  el.settingsModal.addEventListener("click", (e) => { if (e.target === el.settingsModal) closeSettings(); });

  el.saveSettingsBtn.addEventListener("click", () => {
    Storage.setApiKey(el.apiKeyInput.value);
    Storage.setModel(el.modelSelect.value);
    closeSettings();
    showToast("Settings saved.");
  });

  // ---------- Toast ----------
  let toastTimer;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2800);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- Init ----------
  if (!Storage.getApiKey()) {
    setTimeout(() => { openSettings(); showToast("Add your Anthropic API key to get started."); }, 400);
  }
  el.modelSelect.value = Storage.getModel();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
