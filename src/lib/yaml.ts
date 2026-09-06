/**
 * Single YAML entry point for the codebase.
 *
 * js-yaml 5 switched its default to the YAML 1.2 Core schema (timestamps stay
 * strings, `yes`/`no` stay strings) and throws on empty input. Frontmatter on
 * this site relies on the 1.1 behaviour (`pubDate: 2026-05-10` → Date), so we
 * pin `YAML11_SCHEMA` here and make empty input return `undefined` like v4 did.
 * Import from this module, never from "js-yaml" directly.
 */
import {
  dump as dumpYaml,
  load as loadYaml,
  YAML11_SCHEMA,
  type DumpOptions,
  type LoadOptions,
} from "js-yaml";

export const load = (source: string, options?: LoadOptions): unknown =>
  source.trim() === "" ? undefined : loadYaml(source, { schema: YAML11_SCHEMA, ...options });

export const dump = (value: unknown, options?: DumpOptions): string =>
  dumpYaml(value, { schema: YAML11_SCHEMA, ...options });
