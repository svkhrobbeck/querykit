---
"@querykitjs/core": minor
---

New subpath export `@querykitjs/core/internal`, for adapter authors only: cursor tokens (`encodeCursor`, `decodeCursor`), skip diagnostics (`reportSkip`), the per-call repository context (`createContextStore`), sort normalization (`normalizeSort`) and the pagination metas (`clampPageSize`, `clampPage`, `clampOffset`, `offsetMeta`, `infinitePage`, `cursorPage`). The main `@querykitjs/core` entry is unchanged. The internal entry is not application API and may change in a minor release.
