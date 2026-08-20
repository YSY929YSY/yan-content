/**
 * 远端内容的最低运行时结构闸门。
 *
 * 它只拦「会让当前主线页面因为无守卫解引用而崩掉」的顶层形状，
 * 不评价内容真假、字段完整度或 publication。发布期的深度校验不该搬进手机。
 */

export type ContentShapeResult =
  | { ok: true; reason: null }
  | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const REQUIRED_ARRAYS = ['scenes', 'mapPlaces', 'culturalFusion', 'kanaRows', 'wordBank'] as const;
const OPTIONAL_ARRAYS = ['voicedRows', 'yoonRows', 'specialRows', 'loanwordRows'] as const;

/**
 * `reason` 仅描述路径和期望类型，刻意不带远端内容值，避免把整包打进日志。
 */
export function validateContentShape(value: unknown): ContentShapeResult {
  if (!isPlainObject(value)) return { ok: false, reason: '$: expected object' };

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(value[key])) return { ok: false, reason: `${key}: expected array` };
  }

  if (!isPlainObject(value.subwayAdventure)) {
    return { ok: false, reason: 'subwayAdventure: expected object' };
  }
  if (!Array.isArray(value.subwayAdventure.stations)) {
    return { ok: false, reason: 'subwayAdventure.stations: expected array' };
  }

  for (const key of OPTIONAL_ARRAYS) {
    if (key in value && !Array.isArray(value[key])) {
      return { ok: false, reason: `${key}: expected array when present` };
    }
  }

  if ('_meta' in value && !isPlainObject(value._meta)) {
    return { ok: false, reason: '_meta: expected object when present' };
  }

  return { ok: true, reason: null };
}
