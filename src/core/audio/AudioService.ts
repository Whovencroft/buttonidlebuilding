export interface AudioTrackDefinition {
  id: string;
  src: string;
  loop?: boolean;
  volume?: number;
  preload?: 'auto' | 'metadata' | 'none';
}

export interface AudioServiceOptions {
  masterVolume?: number;
}

/**
 * Minimal audio service scaffold.
 * This keeps audio concerns out of scenes and gives the host one place to
 * control music, SFX, mute state, and lifecycle.
 */
export class AudioService {
  private readonly tracks = new Map<string, HTMLAudioElement>();
  private masterVolume: number;

  public constructor(options: AudioServiceOptions = {}) {
    this.masterVolume = options.masterVolume ?? 1;
  }

  public registerTrack(definition: AudioTrackDefinition): HTMLAudioElement {
    const existing = this.tracks.get(definition.id);
    if (existing) {
      return existing;
    }

    const audio = new Audio(definition.src);
    audio.loop = definition.loop ?? false;
    audio.preload = definition.preload ?? 'auto';
    audio.volume = clampVolume((definition.volume ?? 1) * this.masterVolume);

    this.tracks.set(definition.id, audio);
    return audio;
  }

  public async play(trackId: string): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) {
      return;
    }

    try {
      await track.play();
    } catch {
      // Browser autoplay restrictions are expected.
    }
  }

  public pause(trackId: string): void {
    this.tracks.get(trackId)?.pause();
  }

  public stop(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    track.pause();
    track.currentTime = 0;
  }

  public stopAll(): void {
    for (const track of this.tracks.values()) {
      track.pause();
      track.currentTime = 0;
    }
  }

  public setMasterVolume(nextVolume: number): void {
    this.masterVolume = clampVolume(nextVolume);
    for (const track of this.tracks.values()) {
      track.volume = clampVolume(this.masterVolume);
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public hasTrack(trackId: string): boolean {
    return this.tracks.has(trackId);
  }
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}
