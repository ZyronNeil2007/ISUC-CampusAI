/**
 * Text safety for knowledge-pack content (README 16.4).
 *
 * Retrieved passages are untrusted DATA. They are placed inside a delimited block of the prompt and the model is
 * told never to follow instructions found there, but we also:
 *   - flag instruction-like phrases at build time so a person reviews them before publishing, and
 *   - neutralise the few strings that could confuse the prompt structure when a passage is shown to the model.
 * Pure functions: shared by the build tool (Node) and the app (browser).
 */

// Deliberately specific. Broad patterns such as "you are now" or "act as" appear in ordinary campus text
// ("You are now officially enrolled", "may act as adviser") and would bury real findings in noise.
const INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|rules?|prompts?|messages?|directions?)/i,
  /\bdisregard\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|system)\b/i,
  /\bforget\s+(?:everything|all|your)\s+(?:above|previous|prior|instructions?|rules?)/i,
  /\bnew\s+instructions?\s*:/i,
  /\b(?:system|developer)\s+(?:prompt|message)\b/i,
  /\b(?:reveal|show|print|repeat)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules)\b/i,
  /\bpretend\s+(?:to\s+be|that\s+you)\b/i,
  /<\|[a-z_]+\|>/i, // chat-template special tokens
  /\[\/?INST\]/i,
  /^\s*(?:system|assistant)\s*:/im,
];

/** Instruction-like phrases found in the text (at most five, unique, trimmed). Empty when nothing looks suspicious. */
export function findInjectionPhrases(text) {
  const found = [];
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.exec(String(text ?? ''));
    if (match) {
      const snippet = match[0].replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!found.includes(snippet)) found.push(snippet);
    }
    if (found.length >= 5) break;
  }
  return found;
}

// Control characters except tab and newline, plus zero-width and bidirectional override characters
// that can hide text from a human reviewer while the model still reads it.
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

/** Remove characters that are invisible to a reviewer. */
export function stripHiddenCharacters(text) {
  return String(text ?? '').replace(HIDDEN_CHARS, '');
}

/**
 * Make a passage safe to place in the prompt:
 *  - remove hidden characters,
 *  - remove chat-template tokens ("<|im_start|>", "[INST]") that some models treat as structure,
 *  - defuse "[S3]"-style markers so a passage cannot forge a citation to a source the student never saw.
 */
export function neutralizeSource(text) {
  return stripHiddenCharacters(text)
    .replace(/<\|[^|>\n]{1,40}\|>/g, '')
    .replace(/\[\/?INST\]/gi, '')
    .replace(/\[\s*S\s*(\d+)\s*\]/gi, '($1)')
    .replace(/<<<|>>>/g, '')
    .replace(/[ \t]+\n/g, '\n');
}

/** Raw HTML tags (not comments or autolinks) in Markdown text. They would be shown literally, so reviewers should look. */
export function findRawHtml(markdown) {
  const withoutComments = String(markdown ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const withoutCode = withoutComments.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const match = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?>/i.exec(withoutCode);
  return match ? match[0].slice(0, 60) : null;
}
