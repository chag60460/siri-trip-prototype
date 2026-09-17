export async function sendPreferenceReply<T>(
  send: (prompt: string, timeout: number) => Promise<T>,
  prompt: string,
  rejection: () => string | undefined,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  const deadline = Date.now() + 90_000;
  let result = await send(prompt, 90_000);
  signal.throwIfAborted();
  const reason = rejection();
  const remaining = deadline - Date.now();
  if (reason && remaining > 0) {
    console.warn('Retrying a rejected preference card:', reason);
    result = await send(`${prompt}\n\nApplication correction: the previous response failed validation, not a new user permission decision. A tool validation error does NOT mean the user denied access. Use only the explicit permission state above. Correct the tool call for the SAME request. Preserve supplied answers; do not skip an unanswered preference or assume permission. ${reason}`, remaining);
    signal.throwIfAborted();
  }
  return result;
}
