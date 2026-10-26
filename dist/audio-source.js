export function createAudioSourceLoader(audio, sources, {
  fetchResource = globalThis.fetch.bind(globalThis),
  createURL = URL.createObjectURL.bind(URL),
  revokeURL = URL.revokeObjectURL.bind(URL),
  onLoading = () => {},
  onError = () => {},
  maxCachedTracks = 4
} = {}) {
  const cache = new Map();
  const urls = new Set();
  const readyURLs = new Map();
  let lifetime = 0;
  let generation = 0;
  let selected = null;
  let loaded = null;
  let pending = null;

  function prepare(id) {
    if (cache.has(id)) {
      if (readyURLs.has(id)) {
        const url = readyURLs.get(id);
        readyURLs.delete(id);
        readyURLs.set(id, url);
      }
      return cache.get(id);
    }
    const epoch = lifetime;
    const source = sources[id];
    if (!source) return Promise.reject(new Error('Unknown audio track'));
    // The host returns a full 200 response to Range requests. A complete local
    // Blob gives the media element a seekable source, including MP4 metadata.
    const result = fetchResource(source.src, { credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
        return response.arrayBuffer();
      })
      .then(bytes => {
        if (epoch !== lifetime) return null;
        const url = createURL(new Blob([bytes], { type: source.type }));
        urls.add(url);
        readyURLs.set(id, url);
        for (const [oldId, oldURL] of readyURLs) {
          if (readyURLs.size <= Math.max(1, maxCachedTracks)) break;
          if (oldId === selected) continue;
          readyURLs.delete(oldId);
          cache.delete(oldId);
          urls.delete(oldURL);
          revokeURL(oldURL);
        }
        return url;
      })
      .catch(error => { if (epoch === lifetime) cache.delete(id); throw error; });
    cache.set(id, result);
    return result;
  }

  function select(id) {
    if (selected === id && pending) return pending;
    if (loaded === id && selected === id) return Promise.resolve(true);
    selected = id;
    loaded = null;
    const request = ++generation;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    onLoading(true);
    const work = prepare(id).then(url => {
      if (request !== generation || !url) return false;
      audio.src = url;
      audio.preload = 'metadata';
      audio.load();
      loaded = id;
      onLoading(false);
      return true;
    }).catch(error => {
      if (request === generation) {
        selected = null;
        onLoading(false);
        onError(error);
      }
      return false;
    }).finally(() => { if (request === generation) pending = null; });
    pending = work;
    return work;
  }

  function dispose() {
    generation++;
    lifetime++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    selected = loaded = pending = null;
    for (const url of urls) revokeURL(url);
    urls.clear();
    cache.clear();
    readyURLs.clear();
  }
  return { select, dispose };
}
