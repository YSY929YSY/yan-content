// 词场成员高亮只消费已有的词库与例句辞书形索引，不猜新的词义。

const splitVariants = (value) => String(value || '')
  .split(/[;；]/u)
  .map(part => part.trim())
  .filter(Boolean);

const canBeContained = (value) => /\p{Script=Han}/u.test(value)
  || Array.from(value).length > 1;

export function fieldMemberTerms(wordField, lookupWord) {
  return (wordField?.members || [])
    .map(member => lookupWord?.(member.id))
    .filter(Boolean)
    .flatMap(word => [
      ...splitVariants(word.word),
      ...splitVariants(word.reading),
    ]);
}

const hasDictionaryForm = (surface, term, dictionaryForms) => {
  if (!(dictionaryForms instanceof Map)) return false;
  for (const [inflectedSurface, forms] of dictionaryForms) {
    if (canBeContained(inflectedSurface) && surface.includes(inflectedSurface)
      && forms instanceof Set && forms.has(term)) return true;
  }
  return false;
};

export function isFieldMemberToken(token, terms, dictionaryForms) {
  const surface = String(token?.jp || '');
  if (!surface) return false;
  return (terms || []).some(term => term && (
    term === surface
    || (canBeContained(term) && surface.includes(term))
    || dictionaryForms?.get(surface)?.has(term)
    || hasDictionaryForm(surface, term, dictionaryForms)
  ));
}
