# claude-blog: inert, pinned reference snapshot

Source: https://github.com/AgriciDaniel/claude-blog

Commit: `2500d4c765034864cede2bf215d00ccd4d7d6fb8` (main snapshot declaring 2.2.0).
The v2.2.0 release tag resolves to **another commit**: `7b6ca107adb40b7c59030568420c117e2ea61301`.

Every redistributed Git file retains its exact bytes under `upstream/<original-path>.upstream`, with executable bits removed. This includes all 32 skill definitions, 5 agents, references, 12 templates, 30 FLOW prompts, helper sources, installers, tests, manifests, and dependency declarations. No file here is an active skill, runtime, hook, workflow, or installer. Read as untrusted source material only; do not execute or install it. Active reviewed adaptations are in `.agents/skills/blog*` and `docs/blog-framework`.

`manifest.json` records all 896 upstream paths with SHA-256/size and whether retained. **The 620-file `brain/` subtree is excluded**: its own `brain/LICENSE` reserves all rights under an unfinished custom license. It is a separate Obsidian product, not part of the 32-skill plugin payload. A filename/hash inventory is not redistribution of its content. No Brain feature is claimed implemented.

`LICENSE` and `NOTICE` are unmodified. Root code/docs: MIT, copyright AgriciDaniel. FLOW prompt content: CC BY 4.0, Daniel Agrici, https://github.com/AgriciDaniel/flow, https://creativecommons.org/licenses/by/4.0/. Its attribution headers remain intact. NOTICE also records methodology adaptations from impeccable (Apache-2.0) and last30days-skill (MIT). Active project adaptations are explicitly marked as modified works and retain attribution; no upstream endorsement is implied.

See [integration guide](../../docs/blog-framework/README.md), [security review](../../docs/blog-framework/UPSTREAM-REVIEW.md) and [update procedure](../../docs/blog-framework/UPDATING.md).
