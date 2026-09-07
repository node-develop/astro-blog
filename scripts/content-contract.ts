import { mkdir, writeFile } from "node:fs/promises";
import { openApiDocument } from "../src/lib/content-api/openapi";

await mkdir("docs/api", { recursive: true });
await writeFile("docs/api/openapi.json", JSON.stringify(openApiDocument, null, 2) + "\n");
await writeFile(
  "docs/api/article.schema.json",
  JSON.stringify(openApiDocument.components.schemas.ArticleDocument, null, 2) + "\n",
);
