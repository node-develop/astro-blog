import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildSearchVectorSql } from "~/lib/search/vector";

const dialect = new PgDialect();

describe("buildSearchVectorSql", () => {
  it("weights title A, tags B, body C", () => {
    const sql = buildSearchVectorSql({
      title: "Hello world",
      tags: ["astro", "blog"],
      body: "First post body",
    });
    // Compile the Drizzle SQL fragment to a parameterised SQL string for inspection.
    const text = dialect.sqlToQuery(sql).sql;
    expect(text).toContain("setweight");
    expect(text).toContain("'A'");
    expect(text).toContain("'B'");
    expect(text).toContain("'C'");
    expect(text).toContain("unaccent");
    expect(text).toContain("'simple'");
  });

  it("handles empty tags array", () => {
    const sql = buildSearchVectorSql({ title: "T", tags: [], body: "B" });
    const compiled = dialect.sqlToQuery(sql);
    expect(compiled.sql).toBeTruthy();
    expect(compiled.params).toContain("");
  });
});
