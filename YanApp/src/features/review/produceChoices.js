const PUNCTUATION = new Set('，。！？、,.!?'.split(''));
const BOUNDARY_PARTICLES = new Set('はがをにでとものへや'.split(''));

/** 把已有日语答案切成稳定、可回拼的有限词块；不调用模型、不改内容包。 */
export function splitJapanese(answer) {
  const text = String(answer || '').replace(/\s+/g, '');
  const blocks = [];
  let current = '';
  const flush = () => { if (current) { blocks.push(current); current = ''; } };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (PUNCTUATION.has(ch)) { flush(); blocks.push(ch); continue; }
    current += ch;
    const next = text[i + 1] || '';
    if (BOUNDARY_PARTICLES.has(ch) && next && !BOUNDARY_PARTICLES.has(next)) flush();
    if (ch === 'か' && (!next || PUNCTUATION.has(next))) flush();
  }
  flush();
  return blocks;
}

const wordText = (value) => typeof value === 'string' ? value : (value?.word || value?.reading || '');

export function buildProduceChoices(unit, sceneWords = [], distractorLimit = 3) {
  const blocks = splitJapanese(unit?.answer);
  if (blocks.length <= 1) return { mode: 'self_assess', blocks, choices: [], correct: blocks };
  const correct = new Set(blocks);
  const distractors = [...new Set(sceneWords.map(wordText).filter(Boolean))]
    .filter((word) => !correct.has(word))
    .slice(0, Math.max(1, distractorLimit));
  return { mode: 'choices', blocks, choices: [...new Set([...blocks, ...distractors])], correct: blocks };
}

export function isProduceAnswer(selected, correct) {
  return Array.isArray(selected) && Array.isArray(correct)
    && selected.length === correct.length
    && selected.every((block, index) => block === correct[index]);
}
