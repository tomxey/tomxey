/// The pmtiles `Source` interface over a UnixFS file held on IPFS.
///
/// This is the whole reason the design works lazily: a ranged read resolves
/// to the DAG blocks covering that range, so one 4 KB tile costs one or two
/// 256 KB blocks out of 116 rather than the whole 29 MB archive.
///
/// pmtiles ships FileSource, but it is typed for `File` and we have neither
/// a File nor a Blob. The interface is two methods, so implement it.
export function makeTileSource({ fs, cid, key }) {
  return {
    getKey: () => key,

    /// pmtiles calls this as getBytes(offset, length, signal, etag) and does
    /// pass a signal; MapLibre aborts superseded tile reads when the user
    /// pans. Forward it, or those block fetches keep competing for the one
    /// p2p connection with the tiles now actually on screen.
    async getBytes(offset, length, signal) {
      const parts = [];
      let total = 0;
      // Let errors propagate: a short buffer would reach pmtiles as a
      // corrupt archive rather than as a failed fetch.
      for await (const chunk of fs.cat(cid, { offset, length, signal })) {
        parts.push(chunk);
        total += chunk.length;
      }
      const out = new Uint8Array(total);
      let at = 0;
      for (const part of parts) {
        out.set(part, at);
        at += part.length;
      }
      return { data: out.buffer };
    },
  };
}
