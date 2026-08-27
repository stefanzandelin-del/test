// Talks directly to the Anthropic Messages API from the browser.
// Requires the user's own API key (Settings) and the direct-browser-access header.

const LawnAPI = (() => {
  const ENDPOINT = "https://api.anthropic.com/v1/messages";
  const API_VERSION = "2023-06-01";

  const DIAGNOSIS_TOOL = {
    name: "report_diagnosis",
    description: "Report a structured lawn/garden diagnosis and remedy plan for the photographed plant or problem.",
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

    return `${base}${notesPart}\n\nLook carefully at the photo and call the report_diagnosis tool with your best assessment. If you are genuinely unsure, say so honestly with confidence "low" and mention the most likely alternatives in identification_notes, rather than guessing with false confidence.`;
  }

  async function identify({ base64Image, mediaType, mode, notes, apiKey, model }) {
    if (!apiKey) {
      const err = new Error("Missing API key. Add your Anthropic API key in Settings.");
      err.code = "NO_KEY";
      throw err;
    }

    const body = {
      model,
      max_tokens: 1500,
      tools: [DIAGNOSIS_TOOL],
      tool_choice: { type: "tool", name: "report_diagnosis" },
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
      const err = new Error(
        res.status === 401
          ? "Anthropic rejected the API key. Double-check it in Settings."
          : `API error (${res.status}): ${detail || res.statusText}`
      );
      err.code = "API";
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "report_diagnosis");
    if (!toolUse) {
      const err = new Error("The model didn't return a structured diagnosis. Try again.");
      err.code = "PARSE";
      throw err;
    }
    return toolUse.input;
  }

  return { identify };
})();
