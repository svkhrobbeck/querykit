---
"@querykitjs/prisma-pg": major
---

Support Prisma 7 alongside Prisma 6.19: the peer is now `@prisma/client ^6.19 || ^7.10` (was `>=5`; Prisma 5 and older 6.x are no longer supported). Both ends are tested with the `prisma-client` generator and `@prisma/adapter-pg`. The package's types now come from `@prisma/client/runtime/client` (Prisma 7 has no `runtime/library`). Repository code does not change; see the README section "Prisma 7 and Prisma 6" for client setup.
