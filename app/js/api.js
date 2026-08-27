// Talks directly to the Anthropic Messages API from the browser.
// Requires the user's own API key (Settings) and the direct-browser-access header.

const LawnAPI = (() => {
  const ENDPOINT = "https://api.anthropic.com/v1/messages";
  const API_VERSION = "2023-06-01";

  // Server-side tool: Claude runs a real web search and the results are inserted into
  // its own context before it answers, so remedies can be grounded in current, real
  // sources (extension offices, master gardener sites) rather than only recalled
  // training knowledge.
  const WEB_SEARCH_TOOL = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
  };

  const DIAGNOSIS_TOOL = {
    name: "report_diagnosis",
    description: "Report a structured lawn/garden diagnosis and remedy plan for the photographed plant or problem. This must be your final action.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Common name, with scientific name in parentheses if known, e.g. \"Dandelion (Taraxacum officinale)\". If not a plant issue (e.g. a fungus or pest), just the common name.",
        },
        category: {
          type: "string",
          enum: ["weed", "disease", "pest", "nutrient_or_watering", "desirable_plant", "unknown"],
        },
        is_weed_or_unwanted: {
          type: "boolean",
          description: "True if this is a weed / unwanted plant that should generally be removed. False if it's a desirable plant, or not a plant-removal question at all.",
        },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        summary: {
          type: "string",
          description: "1-3 sentence plain-language summary of what is shown and what's going on.",
        },
        identification_notes: {
          type: "string",
          description: "Key visual features that led to this identification (leaf shape, growth pattern, color, etc). Keep it brief.",
        },
        remedy_organic: {
          type: "array",
          items: { type: "string" },
          description: "Non-chemical / organic remedy steps (hand-pulling, mulching, cultural practices, organic products).",
        },
        remedy_chemical: {
          type: "array",
          items: { type: "string" },
          description: "Chemical/herbicide or pesticide options if relevant, with general product-type guidance (not brand endorsements). Empty array if not applicable.",
        },
        prevention: {
          type: "array",
          items: { type: "string" },
          description: "Steps to prevent recurrence.",
        },
        timing: {
          type: "string",
          description: "Best timing/conditions to act (season, weather, growth stage).",
        },
        safety_notes: {
          type: "string",
          description: "Any safety cautions: pet/child safety, invasive species reporting, look-alike warnings, or note that this may be toxic/invasive.",
        },
        sources: {
          type: "array",
          description: "1-3 authoritative sources (university extension offices, master gardener programs, USDA/RHS, etc.) found via web_search that back up the removal/control guidance. Omit only if web search was unavailable or returned nothing useful.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
            },
            required: ["title", "url"],
          },
        },
      },
      required: [
        "name", "category", "is_weed_or_unwanted", "confidence", "summary",
        "identification_notes", "remedy_organic", "remedy_chemical", "prevention", "timing", "safety_notes",
      ],
    },
  };

  function promptForMode(mode, notes) {
    const base = mode === "bed"
      ? `You are an expert horticulturist helping a home gardener with a flower bed. The photo shows a plant they suspect may be a weed or unwanted volunteer plant growing among their flowers. Identify the plant, state clearly whether it is a weed/unwanted plant that should be removed or a desirable plant that should be kept, and give a removal plan if it should go (including how to avoid damaging desirable neighboring plants).`
      : `You are an expert lawn-care agronomist. The photo shows a patch of lawn/turf with a problem the homeowner wants diagnosed - this could be a weed, a fungal or bacterial disease, an insect pest, a nutrient or watering issue, or something else. Identify the most likely cause and give a remedy plan.`;

    const notesPart = notes && notes.trim()
      ? `\n\nThe homeowner also noted: "${notes.trim()}"`
      : "";

    return `${base}${notesPart}

Work in two steps:
1. Look carefully at the photo and identify the specific plant, weed, disease, or pest as precisely as you can (species-level when possible).
2. Use the web_search tool at least once to look up current, authoritative removal/control guidance for that exact species (e.g. site:.edu extension office pages, master gardener programs, USDA, RHS). Don't just rely on memory - confirm or refine your remedy plan with what you find, and note which sources you used.

Then call the report_diagnosis tool with your final assessment, including the sources you consulted. That tool call must be your last action - don't end your turn with plain text.

If you are genuinely unsure of the identification, say so honestly with confidence "low" and mention the most likely alternatives in identification_notes, rather than guessing with false confidence.`;
  }

  async function identify({ base64Image, mediaType, mode, notes, apiKey, model }) {
    if (!apiKey) {
      const err = new Error("Missing API key. Add your Anthropic API key in Settings.");
      err.code = "NO_KEY";
      throw err;
    }

    const body = {
      model,
      max_tokens: 3000,
      tools: [WEB_SEARCH_TOOL, DIAGNOSIS_TOOL],
      // Must stay "auto" (not forced to report_diagnosis) so Claude is free to call
      // web_search first - forcing a specific tool would block it from searching at all.
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: promptForMode(mode, notes) },
          ],
        },
      ],
    };

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      const err = new Error("Network error reaching Anthropic's API. Check your connection and try again.");
      err.code = "NETWORK";
      throw err;
    }

    if (!res.ok) {
      let detail = "";
      try {
        const errJson = await res.json();
        detail = errJson?.error?.message || "";
      } catch {
        // ignore
      }
      const hint = /web_search/i.test(detail)
        ? " Web search may be disabled for this API key/organization - check Console > Settings > Capabilities."
        : "";
      const err = new Error(
        res.status === 401
          ? "Anthropic rejected the API key. Double-check it in Settings."
          : `API error (${res.status}): ${detail || res.statusText}${hint}`
      );
      err.code = "API";
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.content || [];

    const toolUse = content.find((b) => b.type === "tool_use" && b.name === "report_diagnosis");
    if (!toolUse) {
      const err = new Error(
        "Claude didn't finish with a structured diagnosis (it may have stopped mid-search). Please try again."
      );
      err.code = "PARSE";
      throw err;
    }

    const result = toolUse.input;

    // If the model forgot to list sources itself, fall back to whatever web_search
    // actually returned so the citations still show up.
    if (!result.sources || !result.sources.length) {
      const found = [];
      for (const block of content) {
        if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
        for (const r of block.content) {
          if (r.url && found.length < 3 && !found.some((f) => f.url === r.url)) {
            found.push({ title: r.title || r.url, url: r.url });
          }
        }
      }
      if (found.length) result.sources = found;
    }

    return result;
  }

  return { identify };
})();
