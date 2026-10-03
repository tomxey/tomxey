export class TimeoutError extends Error {
  constructor(stage, ms) {
    super(`${stage} timed out after ${Math.round(ms / 1000)}s (${ms} ms)`);
    this.name = 'TimeoutError';
    this.stage = stage;
    this.ms = ms;
  }
}

/// Bound a promise that has no timeout of its own.
///
/// Peer-to-peer block retrieval can stall indefinitely: the connection is
/// up, the peer simply never sends. Without a bound the page sits on its
/// last status message forever, which is indistinguishable from a hang and
/// tells the user nothing.
export function withTimeout(promise, ms, stage) {
  let timer;
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(stage, ms)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
