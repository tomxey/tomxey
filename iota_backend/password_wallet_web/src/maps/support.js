/// MapLibre throws during construction when WebGL is unavailable, leaving a
/// blank page. Probe first so the page can say what is wrong.
export function webglAvailable(createCanvas = () => document.createElement('canvas')) {
  try {
    return Boolean(createCanvas().getContext('webgl2'));
  } catch {
    return false;
  }
}
