/// Ask the browser to offer saving the credentials. Chromium exposes the
/// Credential Management API; elsewhere (e.g. iOS Safari) the save prompt
/// comes from the surrounding <form autocomplete=…> submission heuristics,
/// and this is a silent no-op.
export async function offerPasswordSave(username, password) {
  try {
    if (window.PasswordCredential) {
      await navigator.credentials.store(new PasswordCredential({ id: username, password }));
    }
  } catch (error) {
    console.warn('credential store declined/unavailable', error);
  }
}
