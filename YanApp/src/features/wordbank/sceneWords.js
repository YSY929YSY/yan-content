const tagsOf = (word) => {
  const scene = word?.tags?.scene;
  if (Array.isArray(scene)) return scene.filter((value) => typeof value === 'string');
  return typeof scene === 'string' ? [scene] : [];
};

const productScenesOf = (word) => tagsOf(word).filter((scene) => scene !== 'daily');

/** 返回一个场景里已发布、且明确标注该场景的词，保持内容包顺序。 */
export function sceneWordsOf(wordBank, sceneId) {
  if (!Array.isArray(wordBank) || typeof sceneId !== 'string' || sceneId === 'daily') return [];
  return wordBank.filter((word) => word?.publication?.learning === true
    && productScenesOf(word).includes(sceneId));
}

/** 返回词条的产品场景标签；daily 只是默认分类，不算具体场景。 */
export function scenesOfWord(word) {
  return productScenesOf(word);
}

