# @garage/crypto

AES-256-GCM encrypt/decrypt helpers shared by both BFFs.

```ts
import { createCrypto } from '@garage/crypto';
const { encrypt, decrypt } = createCrypto(process.env.ENCRYPTION_KEY); // 32-byte key
```

- `encrypt(text)` → `iv:authTag:ciphertext` (hex), with a fresh random IV per call.
- `decrypt(text)` → plaintext; verifies the GCM auth tag, so tampering throws.
  `decrypt('')` returns `''` — the sentinel for optional encrypted columns.

Each BFF's `src/encryption.ts` re-exports a `createCrypto` instance bound to its
`ENCRYPTION_KEY` and uses it to encrypt `Cluster.adminToken` / `Connection`
credentials at rest.
