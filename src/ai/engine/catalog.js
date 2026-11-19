/**
 * Candidate models to benchmark (README 7.2). IDs come from WebLLM's prebuilt list (v0.2.x);
 * tests/ai/catalog.test.mjs checks them against the installed WebLLM so an upgrade cannot silently drop one.
 *
 * - `f16` builds need the WebGPU "shader-f16" feature; `f32` builds work more widely but use more memory.
 * - vramMB is WebLLM's published GPU memory requirement for that build.
 * - approxDownloadMB is a rough ESTIMATE of the q4 weights (not measured); the UI labels it as an estimate.
 *   Replace with measured values during Phase 7 benchmarking.
 * - license names were checked against each model's published license (Qwen blog, Hugging Face model cards,
 *   Meta's Llama 3.2 license). Licensing is a selection criterion in the README; this is not legal advice,
 *   and the university should review the terms before any public deployment.
 */
export const MODEL_CATALOG = [
  {
    key: 'smollm2-360m',
    name: 'SmolLM2 360M',
    family: 'SmolLM2',
    note: 'Smallest and fastest. Best for weak devices; answers are the least reliable.',
    license: 'Apache 2.0',
    approxDownloadMB: 250,
    ids: { f16: 'SmolLM2-360M-Instruct-q4f16_1-MLC', f32: 'SmolLM2-360M-Instruct-q4f32_1-MLC' },
    vramMB: { f16: 376, f32: 580 },
  },
  {
    key: 'qwen2.5-0.5b',
    name: 'Qwen2.5 0.5B',
    family: 'Qwen',
    note: 'Small multilingual model.',
    license: 'Apache 2.0',
    approxDownloadMB: 400,
    ids: { f16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC' },
    vramMB: { f16: 945, f32: 1060 },
  },
  {
    key: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    family: 'Llama',
    note: 'Good balance for phones and laptops.',
    license: 'Llama 3.2 Community License',
    licenseNote: 'Requires "Built with Llama" attribution and adherence to Meta\'s Acceptable Use Policy.',
    approxDownloadMB: 700,
    ids: { f16: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', f32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC' },
    vramMB: { f16: 879, f32: 1129 },
  },
  {
    key: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B',
    family: 'Qwen',
    note: 'Stronger instruction following; needs more memory.',
    license: 'Apache 2.0',
    approxDownloadMB: 950,
    ids: { f16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC' },
    vramMB: { f16: 1630, f32: 1889 },
  },
  {
    key: 'qwen2.5-3b',
    name: 'Qwen2.5 3B',
    family: 'Qwen',
    note: 'Best quality of this list; for devices with a capable GPU.',
    license: 'Qwen Research License',
    licenseNote: 'Not Apache 2.0 like the smaller Qwen2.5 models. Review the terms before deploying.',
    approxDownloadMB: 1800,
    ids: { f16: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-3B-Instruct-q4f32_1-MLC' },
    vramMB: { f16: 2505, f32: 2894 },
  },
];

export const DEFAULT_MODEL_KEY = 'llama-3.2-1b';

export function getModel(key) {
  return MODEL_CATALOG.find((m) => m.key === key) ?? null;
}

/** Resolve the concrete WebLLM model id for this device. */
export function resolveModelId(model, shaderF16) {
  return shaderF16 ? model.ids.f16 : model.ids.f32;
}

export function resolveVramMB(model, shaderF16) {
  return shaderF16 ? model.vramMB.f16 : model.vramMB.f32;
}
