import { vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Returns a vi mock for Anthropic SDK's `messages.create` whose return value
 * is the recorded JSON response from `tests/fixtures/anthropic/<name>.json`.
 *
 * Update fixtures by re-running with real API and writing the response to disk
 * (out of scope here — we ship hand-crafted fixtures matching expected schemas).
 */
export const mockAnthropicWithFixture = (fixtureName: string) => {
  const path = join(HERE, `${fixtureName}.json`);
  if (!existsSync(path)) throw new Error(`fixture not found: ${path}`);
  const response = JSON.parse(readFileSync(path, "utf8"));
  return vi.fn().mockResolvedValue(response);
};

export const writerFixture = (channel: string, scenario: string): string =>
  `writer-${channel}-${scenario}`;

export const editorFixture = (channel: string, scenario: string): string =>
  `editor-${channel}-${scenario}`;

export const criticFixture = (scenario: string): string => `critic-${scenario}`;
