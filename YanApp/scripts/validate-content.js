#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = '../yan-content/content.v2.json';
const REQUIRED_TOP_LEVEL_KEYS = [
  '_meta',
  'scenes',
  'mapPlaces',
  'kanaRows',
  'voicedRows',
  'yoonRows',
  'specialRows',
  'loanwordRows',
  'subwayAdventure',
  'culturalFusion',
];
const REQUIRED_SCENE_KEYS = ['id', 'label', 'desc', 'emoji', 'color', 'bgColor', 'ready', 'phrases'];
const REQUIRED_PHRASE_KEYS = ['id', 'jp', 'zh', 'en', 'roma', 'scene', 'hook', 'hookType'];
const REQUIRED_PLACE_KEYS = ['id', 'name', 'loc', 'type', 'emoji', 'jp', 'zh', 'note', 'lang'];
const REQUIRED_MEMORY_ROOT_KEYS = ['version', 'title', 'cardType'];
const REQUIRED_MEMORY_LANGUAGE_KEYS = ['code', 'name'];
const REQUIRED_MEMORY_PHRASE_KEYS = ['text', 'translation'];
const REQUIRED_MEMORY_CONTEXT_KEYS = ['situation'];
const REQUIRED_MEMORY_REVIEW_KEYS = ['prompt', 'answer'];
const REQUIRED_KANA_CHAR_KEYS = ['kana', 'roma'];
const KANA_ROW_KEYS = ['kanaRows', 'voicedRows', 'yoonRows', 'specialRows', 'loanwordRows'];
const VALID_PLACE_TYPES = new Set(['snow', 'volcano', 'water', 'cafe']);
const KNOWN_TOP_LEVEL_KEYS = new Set([
  ...REQUIRED_TOP_LEVEL_KEYS,
  'specialSounds',
  'cultureNotes',
]);
const PLACEHOLDER_RE = /TODO|placeholder|lorem|待补充|开发中|test/i;

const targetPath = process.argv[2] || DEFAULT_FILE;
const resolvedPath = path.resolve(process.cwd(), targetPath);
const errors = [];
const warnings = [];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEmpty(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function requireKeys(object, keys, label) {
  for (const key of keys) {
    if (isEmpty(object?.[key])) {
      addError(`${label} missing required field: ${key}`);
    }
  }
}

function checkDuplicateId(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (isEmpty(item?.id)) continue;
    if (seen.has(item.id)) {
      addError(`duplicate ${label} id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function warnOptionalArray(value, fieldPath) {
  if (value !== undefined && !Array.isArray(value)) {
    addWarning(`${fieldPath} exists but is not an array`);
  }
}

function countKey(counter, key) {
  const counterKey = isEmpty(key) ? '(missing)' : String(key);
  counter[counterKey] = (counter[counterKey] || 0) + 1;
}

function walkStrings(value, currentPath = '$') {
  if (typeof value === 'string') {
    if (PLACEHOLDER_RE.test(value)) {
      addWarning(`${currentPath} contains placeholder-like text: ${value.slice(0, 80)}`);
    }
    if (value === '') {
      addWarning(`${currentPath} is an empty string`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${currentPath}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      walkStrings(child, `${currentPath}.${key}`);
    }
  }
}

function validateScenes(content) {
  if (!Array.isArray(content.scenes)) {
    addError('top-level scenes must be an array');
    return { readySceneCount: 0, phraseCount: 0 };
  }

  let readySceneCount = 0;
  let phraseCount = 0;
  checkDuplicateId(content.scenes, 'scene');

  content.scenes.forEach((scene, index) => {
    const sceneLabel = `scenes[${index}]${scene?.id ? ` (${scene.id})` : ''}`;
    if (!isObject(scene)) {
      addError(`${sceneLabel} must be an object`);
      return;
    }

    requireKeys(scene, REQUIRED_SCENE_KEYS, sceneLabel);
    warnOptionalArray(scene.notes, `${sceneLabel}.notes`);

    if (!Array.isArray(scene.phrases)) {
      addError(`${sceneLabel}.phrases must be an array`);
      return;
    }

    if (scene.ready === true) {
      readySceneCount += 1;
      if (scene.phrases.length === 0) {
        addError(`${sceneLabel} is ready but has no phrases`);
      }
      if (scene.phrases.length < 5) {
        addWarning(`${sceneLabel} is ready but has fewer than 5 phrases`);
      }
    }

    checkDuplicateId(scene.phrases, `phrase in scene ${scene.id || index}`);

    scene.phrases.forEach((phrase, phraseIndex) => {
      const phraseLabel = `${sceneLabel}.phrases[${phraseIndex}]${phrase?.id ? ` (${phrase.id})` : ''}`;
      if (!isObject(phrase)) {
        addError(`${phraseLabel} must be an object`);
        return;
      }

      phraseCount += 1;
      if (scene.ready === true) {
        requireKeys(phrase, REQUIRED_PHRASE_KEYS, phraseLabel);
      }
      warnOptionalArray(phrase.examples, `${phraseLabel}.examples`);
      warnOptionalArray(phrase.pairExamples, `${phraseLabel}.pairExamples`);
      warnOptionalArray(phrase.links, `${phraseLabel}.links`);
      warnOptionalArray(phrase.swappableWords, `${phraseLabel}.swappableWords`);
    });
  });

  return { readySceneCount, phraseCount };
}

function validateMapPlaces(content) {
  if (!Array.isArray(content.mapPlaces)) {
    addError('top-level mapPlaces must be an array');
    return { placeCount: 0, placeTypeCounts: {}, placesWithMemory: 0, memoryCardTypeCounts: {}, memoryLanguageCounts: {} };
  }
  if (content.mapPlaces.length === 0) {
    addError('top-level mapPlaces must not be empty');
  }

  const placeTypeCounts = {};
  const memoryCardTypeCounts = {};
  const memoryLanguageCounts = {};
  let placesWithMemory = 0;
  checkDuplicateId(content.mapPlaces, 'place');

  content.mapPlaces.forEach((place, index) => {
    const placeLabel = `mapPlaces[${index}]${place?.id ? ` (${place.id})` : ''}`;
    if (!isObject(place)) {
      addError(`${placeLabel} must be an object`);
      return;
    }

    requireKeys(place, REQUIRED_PLACE_KEYS, placeLabel);
    if (!isEmpty(place.type)) {
      placeTypeCounts[place.type] = (placeTypeCounts[place.type] || 0) + 1;
      if (!VALID_PLACE_TYPES.has(place.type)) {
        addError(`${placeLabel}.type is invalid: ${place.type}`);
      }
    }
    warnOptionalArray(place.links, `${placeLabel}.links`);

    if (place.memory !== undefined) {
      validatePlaceMemory(place.memory, `${placeLabel}.memory`, memoryCardTypeCounts, memoryLanguageCounts);
      placesWithMemory += 1;
    }
  });

  for (const type of VALID_PLACE_TYPES) {
    const count = placeTypeCounts[type] || 0;
    if (count < 3) {
      addWarning(`mapPlaces type "${type}" has fewer than 3 places (${count})`);
    }
  }

  return { placeCount: content.mapPlaces.length, placeTypeCounts, placesWithMemory, memoryCardTypeCounts, memoryLanguageCounts };
}

function validatePlaceMemory(memory, memoryLabel, memoryCardTypeCounts, memoryLanguageCounts) {
  if (!isObject(memory)) {
    addError(`${memoryLabel} must be an object`);
    return;
  }

  requireKeys(memory, REQUIRED_MEMORY_ROOT_KEYS, memoryLabel);
  countKey(memoryCardTypeCounts, memory.cardType);

  if (!isObject(memory.language)) {
    addError(`${memoryLabel}.language must be an object`);
  } else {
    requireKeys(memory.language, REQUIRED_MEMORY_LANGUAGE_KEYS, `${memoryLabel}.language`);
    countKey(memoryLanguageCounts, memory.language.code);
  }

  if (!isObject(memory.phrase)) {
    addError(`${memoryLabel}.phrase must be an object`);
  } else {
    requireKeys(memory.phrase, REQUIRED_MEMORY_PHRASE_KEYS, `${memoryLabel}.phrase`);
    if (isEmpty(memory.phrase.audioText)) {
      addWarning(`${memoryLabel}.phrase.audioText is missing`);
    }
    if (isEmpty(memory.phrase.pattern)) {
      addWarning(`${memoryLabel}.phrase.pattern is missing`);
    }
  }

  if (!isObject(memory.context)) {
    addError(`${memoryLabel}.context must be an object`);
  } else {
    requireKeys(memory.context, REQUIRED_MEMORY_CONTEXT_KEYS, `${memoryLabel}.context`);
  }

  if (memory.swap !== undefined) {
    if (!isObject(memory.swap)) {
      addWarning(`${memoryLabel}.swap exists but is not an object`);
    } else if (!Array.isArray(memory.swap.items)) {
      addWarning(`${memoryLabel}.swap exists but swap.items is not an array`);
    } else if (memory.swap.items.length < 3) {
      addWarning(`${memoryLabel}.swap.items has fewer than 3 items (${memory.swap.items.length})`);
    }
  }

  if (!isObject(memory.review)) {
    addError(`${memoryLabel}.review must be an object`);
  } else {
    requireKeys(memory.review, REQUIRED_MEMORY_REVIEW_KEYS, `${memoryLabel}.review`);
  }

  if (!isObject(memory.footprint)) {
    addWarning(`${memoryLabel}.footprint is missing`);
  } else {
    if (isEmpty(memory.footprint.traceText)) {
      addWarning(`${memoryLabel}.footprint.traceText is missing`);
    }
    if (isEmpty(memory.footprint.stampLabel)) {
      addWarning(`${memoryLabel}.footprint.stampLabel is missing`);
    }
    if (isEmpty(memory.footprint.memoryHook)) {
      addWarning(`${memoryLabel}.footprint.memoryHook is missing`);
    }
  }
}

function validateKanaRows(content) {
  const counts = {};

  for (const rowKey of KANA_ROW_KEYS) {
    const rows = content[rowKey];
    counts[rowKey] = Array.isArray(rows) ? rows.length : null;

    if (!Array.isArray(rows)) {
      addError(`top-level ${rowKey} must be an array`);
      continue;
    }

    rows.forEach((row, rowIndex) => {
      const rowLabel = `${rowKey}[${rowIndex}]`;
      if (!isObject(row)) {
        addError(`${rowLabel} must be an object`);
        return;
      }

      if (!Array.isArray(row.chars)) {
        addError(`${rowLabel}.chars must be an array`);
        return;
      }

      row.chars.forEach((char, charIndex) => {
        const charLabel = `${rowLabel}.chars[${charIndex}]${char?.kana ? ` (${char.kana})` : ''}`;
        if (!isObject(char)) {
          addError(`${charLabel} must be an object`);
          return;
        }

        requireKeys(char, REQUIRED_KANA_CHAR_KEYS, charLabel);
        if (!char.strokeKey) {
          addWarning(`${charLabel} has no strokeKey`);
        }
        if (!char.pairStrokeKey) {
          addWarning(`${charLabel} has no pairStrokeKey`);
        }
        warnOptionalArray(char.examples, `${charLabel}.examples`);
        warnOptionalArray(char.pairExamples, `${charLabel}.pairExamples`);
        warnOptionalArray(char.links, `${charLabel}.links`);
      });
    });
  }

  return counts;
}

function validateSubway(content) {
  if (!isObject(content.subwayAdventure)) {
    addError('top-level subwayAdventure must be an object');
    return;
  }

  if (isEmpty(content.subwayAdventure.title)) {
    addError('subwayAdventure missing required field: title');
  }
  if (!Array.isArray(content.subwayAdventure.stations) || content.subwayAdventure.stations.length === 0) {
    addError('subwayAdventure.stations must be a non-empty array');
  }
}

function validateCulturalFusion(content) {
  if (!Array.isArray(content.culturalFusion) || content.culturalFusion.length === 0) {
    addError('top-level culturalFusion must be a non-empty array');
  }
}

function printList(title, items) {
  console.log(`${title} (${items.length}):`);
  if (!items.length) {
    console.log('  - none');
    return;
  }
  items.forEach(item => console.log(`  - ${item}`));
}

let raw;
let content;

try {
  raw = fs.readFileSync(resolvedPath, 'utf8');
} catch (error) {
  console.error(`File: ${targetPath}`);
  console.error(`FAIL: unable to read file: ${error.message}`);
  process.exit(1);
}

try {
  content = JSON.parse(raw);
} catch (error) {
  console.error(`File: ${targetPath}`);
  console.error(`FAIL: JSON syntax error: ${error.message}`);
  process.exit(1);
}

if (!isObject(content)) {
  addError('content root must be an object');
}

for (const key of REQUIRED_TOP_LEVEL_KEYS) {
  if (content[key] === undefined) {
    addError(`missing top-level required field: ${key}`);
  }
}

if (isObject(content._meta) && !content._meta.version && !content._meta.contentVersion) {
  addWarning('_meta has no version or contentVersion');
}

for (const key of Object.keys(content)) {
  if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
    addWarning(`unknown top-level field: ${key}`);
  }
}

const { readySceneCount, phraseCount } = validateScenes(content);
const { placeCount, placeTypeCounts, placesWithMemory, memoryCardTypeCounts, memoryLanguageCounts } = validateMapPlaces(content);
const kanaCounts = validateKanaRows(content);
validateSubway(content);
validateCulturalFusion(content);
walkStrings(content);

const stats = fs.statSync(resolvedPath);

console.log(`File: ${targetPath}`);
console.log(`Resolved: ${resolvedPath}`);
console.log(`Size: ${stats.size} bytes`);
console.log(`Top-level keys: ${Object.keys(content).sort().join(', ')}`);
console.log(`Scenes: ${Array.isArray(content.scenes) ? content.scenes.length : 'invalid'}`);
console.log(`Ready scenes: ${readySceneCount}`);
console.log(`Phrases: ${phraseCount}`);
console.log(`Map places: ${placeCount}`);
console.log(`Map place types: ${JSON.stringify(placeTypeCounts)}`);
console.log(`Places with memory: ${placesWithMemory}`);
console.log(`Memory card types: ${JSON.stringify(memoryCardTypeCounts)}`);
console.log(`Memory languages: ${JSON.stringify(memoryLanguageCounts)}`);
console.log(`Kana rows: kanaRows=${kanaCounts.kanaRows}, voicedRows=${kanaCounts.voicedRows}, yoonRows=${kanaCounts.yoonRows}, specialRows=${kanaCounts.specialRows}, loanwordRows=${kanaCounts.loanwordRows}`);
printList('Errors', errors);
printList('Warnings', warnings);
console.log(`Result: ${errors.length === 0 ? 'PASS' : 'FAIL'}`);

process.exit(errors.length === 0 ? 0 : 1);
