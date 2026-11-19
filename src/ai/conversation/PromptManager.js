/** Builds the message list sent to the model. Rules follow README section 15. */

const BASE_RULES = `You are CampusAI, a virtual information assistant for Isabela State University – Cabagan Campus (ISU Cabagan).

Rules:
- Use clear, simple language and keep answers concise.
- Never invent ISU-specific schedules, fees, deadlines, requirements, policies, office locations, names or contact details.
- Distinguish general educational explanations from official ISU policy. Label general explanations as "General information".
- If you cannot verify an ISU-specific fact, say so plainly and suggest the student confirm with the responsible office (for example the Registrar's Office or the college/department office).
- Do not guarantee admission, scholarship approval, grades, or graduation eligibility.
- You are an information assistant, not an official university system.`;

/** Used until the verified knowledge base exists (Phase 4). */
const NO_KNOWLEDGE_NOTE = `No verified ISU documents are loaded in this version. Treat every ISU-specific question as unverifiable: do not answer it from memory. You may answer general educational questions.`;

export function buildSystemPrompt({ hasKnowledge = false } = {}) {
  return hasKnowledge ? BASE_RULES : `${BASE_RULES}\n\n${NO_KNOWLEDGE_NOTE}`;
}

/**
 * Keep the system prompt plus the most recent turns within a rough character budget,
 * so small context windows are not overrun. (Token-accurate trimming can replace this later.)
 */
export function buildMessages(history, { hasKnowledge = false, maxChars = 6000 } = {}) {
  const system = { role: 'system', content: buildSystemPrompt({ hasKnowledge }) };
  const kept = [];
  let used = system.content.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const len = m.content.length;
    // Always keep the latest message even if it is long.
    if (kept.length > 0 && used + len > maxChars) break;
    kept.unshift({ role: m.role, content: m.content });
    used += len;
  }
  // The conversation must begin with a user turn.
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return [system, ...kept];
}
