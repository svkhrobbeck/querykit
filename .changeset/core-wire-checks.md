---
"@querykitjs/core": minor
"@querykitjs/class-validator": patch
---

`@querykitjs/core/internal` adds `checkFilter`, `checkSort` and `checkParams`: framework-free checks of the wire contract that return `{ path, key, args }` issues with no message text (for validator authors). `@querykitjs/class-validator` now delegates `validateFilter` / `validateSort` to them; its issues, paths and messages are unchanged.
