// Inline-safe JSON-LD serialisation. Escapes characters that would otherwise
// terminate the surrounding <script> tag or be misread by an HTML parser.
export const safeJsonLd = (data: unknown): string =>
  JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
