// Web Worker running the Argon2id derivation off the main thread — the
// ~1 s / 512 MiB stretch would otherwise freeze the UI, painfully so on
// phones. Loads its own copy of the WASM module.
import init, { derive_seed } from 'password_auth_wasm';

self.onmessage = async (event) => {
  const { password, username } = event.data;
  try {
    await init();
    const seed = derive_seed(password, username);
    self.postMessage({ seed }, [seed.buffer]);
  } catch (error) {
    self.postMessage({ error: `${error?.message ?? error}` });
  }
};
