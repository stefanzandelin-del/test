// Local-storage backed settings and scan history. Nothing here ever leaves the browser
// except the image bytes sent directly to Anthropic's API at identify time (see api.js).

const Storage = (() => {
  const KEYS = {
    apiKey: "lawndoctor.apiKey",
    model: "lawndoctor.model",
    history: "lawndoctor.history",
  };

  const DEFAULT_MODEL = "claude-sonnet-5";
  const MAX_HISTORY = 60;

  function getApiKey() {
    return localStorage.getItem(KEYS.apiKey) || "";
  }
  function setApiKey(key) {
    localStorage.setItem(KEYS.apiKey, key.trim());
  }

  function getModel() {
    return localStorage.getItem(KEYS.model) || DEFAULT_MODEL;
  }
  function setModel(model) {
    localStorage.setItem(KEYS.model, model);
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.history) || "[]");
    } catch {
      return [];
    }
  }

  function addHistoryEntry(entry) {
    const list = getHistory();
    list.unshift(entry);
    while (list.length > MAX_HISTORY) list.pop();
    try {
      localStorage.setItem(KEYS.history, JSON.stringify(list));
    } catch (err) {
      // Storage quota exceeded (base64 thumbnails add up) - drop oldest entries and retry once.
      list.splice(Math.max(1, Math.floor(list.length / 2)));
      localStorage.setItem(KEYS.history, JSON.stringify(list));
    }
  }

  function clearHistory() {
    localStorage.removeItem(KEYS.history);
  }

  return { getApiKey, setApiKey, getModel, setModel, getHistory, addHistoryEntry, clearHistory, DEFAULT_MODEL };
})();
