import chaptersContent from '../content/chapters.json';

/**
 * ChapterGraph reads progression chapter routing from content JSON.
 */
export class ChapterGraph {
  #chaptersBySceneId = new Map();
  #chaptersById = new Map();

  constructor(content = chaptersContent) {
    const chapters = Array.isArray(content?.chapters) ? content.chapters : [];

    for (const chapter of chapters) {
      this.#chaptersById.set(chapter.id, chapter);
      this.#chaptersBySceneId.set(chapter.sceneId, chapter);
    }
  }

  getChapterByScene(sceneId) {
    return this.#chaptersBySceneId.get(sceneId) || null;
  }

  getNextSceneId(sceneId, endingId) {
    const chapter = this.getChapterByScene(sceneId);
    if (!chapter) return null;

    if (endingId && chapter.next && chapter.next[endingId]) {
      return chapter.next[endingId];
    }

    return null;
  }

  getUnlocks(sceneId) {
    const chapter = this.getChapterByScene(sceneId);
    return Array.isArray(chapter?.unlocks) ? [...chapter.unlocks] : [];
  }
}
