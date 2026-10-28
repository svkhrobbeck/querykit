---
"@querykitjs/core": major
"@querykitjs/zod": major
"@querykitjs/class-validator": major
"@querykitjs/drizzle-pg": major
"@querykitjs/prisma-pg": major
"@querykitjs/mongoose": major
"@querykitjs/web": major
---

Require Node.js `>=22.12` (`engines`; Node 20 reached end of life) and declare peer ranges as the last two majors, both ends tested by `bun run test:matrix`: `zod ^4` · `mongoose ^8.24 || ^9.11` · `drizzle-orm >=0.44 <0.46` · `class-validator >=0.14 <0.16`, `class-transformer ^0.5`, `reflect-metadata ^0.1.13 || ^0.2` · `react ^18.3 || ^19.2.7`. See each README's Requirements section.
