import { requestJson } from "../utils/http.js";

function extractOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return null;
  }

  return response.output
    .flatMap((item) => item.content || [])
    .map((content) => content.text || content.output_text || "")
    .join("")
    .trim();
}

export async function maybeGenerateAiBrief(snapshot, analysis) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    input: `Sos un coach de League of Legends. Devolvé un consejo breve en español, claro y accionable.

Jugador actual:
${JSON.stringify(snapshot.player, null, 2)}

Resumen de amenazas:
${JSON.stringify(analysis.threatSummary, null, 2)}

Prioridades recomendadas:
${analysis.buildPlan.itemPriorities.map((item) => `- ${item}`).join("\n")}

Items situacionales:
${analysis.buildPlan.situationalItems.map((item) => `- ${item}`).join("\n")}

Limites:
- No dictes una sola jugada obligatoria.
- Ofrece 2 o 3 ajustes concretos.
- Maximo 120 palabras.`,
  };

  const response = await requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    timeoutMs: 30000,
  });

  return extractOutputText(response);
}
