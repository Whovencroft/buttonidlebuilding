/**
 * AudioService centralizes host-owned audio cue playback.
 */
export class AudioService {
  #cueMap = new Map();

  registerCue(id, src) {
    this.#cueMap.set(id, src);
  }

  playCue(id) {
    const src = this.#cueMap.get(id);
    if (!src) return;

    const audio = new Audio(src);
    void audio.play().catch(() => {
      // Purpose: avoid hard-failing when autoplay restrictions block audio.
    });
  }
}
