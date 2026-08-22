// 口袋只保存裸的「词-读音」键；它不是 SRS 来源，也不加前缀。
export const pocketKey = (word) => (word?.word && word?.reading ? `${word.word}-${word.reading}` : '');

export function normalizePocket(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.filter((key) => typeof key === 'string' && key.trim()))];
}

export function isPocketed(pocket, word) {
  const key = pocketKey(word);
  return !!key && normalizePocket(pocket).includes(key);
}

export function addToPocket(pocket, word) {
  const key = pocketKey(word);
  if (!key) return normalizePocket(pocket);
  return normalizePocket(pocket).includes(key) ? normalizePocket(pocket) : [...normalizePocket(pocket), key];
}

export function removeFromPocket(pocket, word) {
  const key = pocketKey(word);
  return normalizePocket(pocket).filter((item) => item !== key);
}

export function pocketWords(wordBank, pocket) {
  const keys = new Set(normalizePocket(pocket));
  return (Array.isArray(wordBank) ? wordBank : []).filter((word) => keys.has(pocketKey(word)));
}
