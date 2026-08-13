// 言 · 手账的本机存档
//
// 手账是本地优先的:拼一页不能等网,人在飞机上、在没信号的山里照样要能记。
// 所以本机这份是**完整事实**,云端是备份和换机通道 —— 和旅行本一个口径。
//
// 这里只做读写和归一,判断逻辑全在 features/journal/journalModel.js(纯函数,有测试)。
// 落盘是状态的属性不是调用方的责任(硬规矩 2):这个文件导出的每个写入函数
// 都自己落盘,没有「记得调用 save」这回事。
import * as FileSystem from 'expo-file-system/legacy';

import { K, readJsonResult, writeJson } from './storage';
import {
  normalizeMoments, normalizeJournal, normalizeAsset, newAsset, assetUriIn,
  remapCityId, resolveCityId,
} from '../features/journal/journalModel';

const clean = (arr, f) => (Array.isArray(arr) ? arr.map(f).filter(Boolean) : []);

// ── 读 ────────────────────────────────────────────────────────
// readJsonResult 区分「读失败」和「确实没有」,normalize 再做一层逐条的 ——
// 一条写坏的记录不该让整本手账打不开。
//
// ⚠️ **每个读函数都带 ok。** 读完要写回去的地方(importAsset / applyCityRemap /
// 登录补传)必须先看 ok —— 读失败当成空、再拿空的写回去,就是整本手账被清掉。
// 这不是假想:importAsset 里 `writeAssets([...assets, asset])`,
// assets 读失败变成 [] 的话,写回去的就只剩刚加的那一条。

export async function readMoments() {
  const { ok, value } = await readJsonResult(K.moments);
  return { ok, ...normalizeMoments(value || {}) };
}

export async function readTags() {
  const { ok, value } = await readJsonResult(K.momentTags);
  const raw = value;
  return { ok, tags: normalizeMoments({ tags: Array.isArray(raw) ? raw : raw?.tags }).tags };
}

export async function readJournal() {
  const { ok, value } = await readJsonResult(K.journalPages);
  return { ok, ...normalizeJournal(value || {}) };
}

export async function readAssets() {
  const { ok, value } = await readJsonResult(K.journalAssets);
  const raw = value;
  return { ok, assets: clean(Array.isArray(raw) ? raw : raw?.assets, normalizeAsset) };
}

/**
 * 一次读齐。手账首屏要的就是这四份,分四次读会让页面分四次跳。
 *
 * `ok` 是四份的**与** —— 只要有一份没读出来,整份状态就不完整,
 * 任何「读→改→整份写回」的操作都必须停下。
 */
export async function readAll() {
  const [m, t, j, a] = await Promise.all([
    readMoments(), readTags(), readJournal(), readAssets(),
  ]);
  return {
    ok: m.ok && t.ok && j.ok && a.ok,
    moments: m.moments, tags: t.tags, pages: j.pages, cities: j.cities, assets: a.assets,
  };
}

// ── 写 ────────────────────────────────────────────────────────

export const writeMoments = (moments) => writeJson(K.moments, { moments });
export const writeTags = (tags) => writeJson(K.momentTags, { tags });
export const writeAssets = (assets) => writeJson(K.journalAssets, { assets });
export const writeJournal = ({ pages, cities }) => writeJson(K.journalPages, { pages, cities });

// ── 素材入库 ──────────────────────────────────────────────────

/** 素材文件都放这儿。目录名带 v1:以后换布局就换目录,老文件不会被误认。 */
const ASSET_DIR = `${FileSystem.documentDirectory}journal-assets-v1/`;

async function ensureAssetDir() {
  const info = await FileSystem.getInfoAsync(ASSET_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(ASSET_DIR, { intermediates: true });
}

/**
 * 素材文件现在在哪。**读素材一律走这个,不要直接用 `asset.localUri`。**
 *
 * 理由见 `journalModel.assetUriIn`:iOS 的容器 UUID 会变,存下来的绝对路径
 * 隔一次重装就指向不存在的目录。目录每次现拼,存下来的那串只当文件名用。
 */
export const assetUri = (asset) => assetUriIn(ASSET_DIR, asset);

/**
 * 把一张外部图片收进素材库。
 *
 * **必须复制,不能直接存 ImagePicker 给的 uri。** 那个 uri 指向系统的临时缓存,
 * iOS 会在不确定的时候清掉它 —— 页面上就是一张永久裂图,而用户已经把它贴上去了。
 * 打卡照片踩过同一个坑的另一个版本(见 journal-data-design 第四节 portablePath)。
 *
 * 顺序:**先写文件,再写元数据**。反过来的话元数据指向一个还不存在的文件,
 * 中途失败会留下一条永远修不好的破图记录。这里失败就一条记录都不写。
 *
 * @returns {{ asset: object|null, error: string|null }}
 *   失败返回 error 而不是 null —— 拿不到 ≠ 是空的,调用方要能区分「取消」和「出错」。
 */
export async function importAsset(uri, { kind = 'photo', entry = 'upload',
                                         width, height, cityId } = {}) {
  if (!uri) return { asset: null, error: '没有选到图片' };
  try {
    await ensureAssetDir();
    const draft = newAsset({ kind, entry, width, height, cityId });
    // 扩展名跟着来源走,认不出就当 jpg。Skia 按内容解码,后缀只是给人看的。
    const ext = (String(uri).match(/\.(jpe?g|png|heic|webp)(?:$|\?)/i)?.[1] || 'jpg').toLowerCase();
    const dest = `${ASSET_DIR}${draft.id}.${ext}`;

    await FileSystem.copyAsync({ from: uri, to: dest });

    const asset = { ...draft, localUri: dest };
    // ⚠️ 读失败**必须停下**。当成空再写回去 = 整个素材库被这一条覆盖掉。
    // (硬规矩 1:拿不到数据 ≠ 数据是空的。这个项目为此丢过至少四次用户数据,
    //  而这一处是 2026-08-13 新写的代码,一样踩了 —— 所以读函数才改成带 ok。)
    const { ok: readOk, assets } = await readAssets();
    if (!readOk) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return { asset: null, error: '读不到素材库,这次不写 —— 不能拿空的覆盖已有素材' };
    }
    const ok = await writeAssets([...assets, asset]);
    if (!ok) {
      // 元数据没写成,文件就是垃圾 —— 清掉,别在磁盘上留孤儿
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return { asset: null, error: '素材库写入失败' };
    }
    return { asset, error: null };
  } catch (e) {
    return { asset: null, error: e?.message || '未知错误' };
  }
}

/**
 * 城市 id 改写的落盘入口。
 *
 * remapCityId 要一次改四处(册子/标签/页/素材),而这四处躺在三个键里。
 * 三次写入之间断电会留下「一半东京」,所以先在内存里整份算好,再一口气写 ——
 * 中途出错就一处都不改。
 */
export async function applyCityRemap(oldId, newId, cityPatch = {}) {
  const state = await readAll();
  // 同上:状态没读全就改写四处,等于拿残缺的一份覆盖完整的一份
  if (!state.ok) return { changed: false, error: '读不到手账状态,这次不改写' };
  const next = remapCityId(state, oldId, newId, cityPatch);
  if (next === state) return { changed: false };
  const ok = await Promise.all([
    writeTags(next.tags),
    writeAssets(next.assets),
    writeJournal({ pages: next.pages, cities: next.cities }),
  ]);
  return { changed: true, ok: ok.every(Boolean) };
}

/**
 * 记下一座城(反查到就用正式 id,反查不到先落网格 id)。
 *
 * 反查失败不是错误,是常态 —— 返回的 cityId 一样可用,只是 resolved=false,
 * 以后补反查时走 applyCityRemap 合并。
 */
export async function ensureCity({ countryCode, name, nameLocal, lat, lng } = {}) {
  const cityId = resolveCityId({ countryCode, name, lat, lng });
  if (!cityId) return null;
  const { ok, pages, cities } = await readJournal();
  // 读不到就不要建城 —— 会把已有的城市册整份写没
  if (!ok) return cityId;
  if (cities.some(c => c.cityId === cityId)) return cityId;
  const now = new Date().toISOString();
  await writeJournal({
    pages,
    cities: [...cities, {
      cityId,
      name: name || null,
      nameLocal: nameLocal || null,
      countryCode: countryCode || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      resolved: !cityId.startsWith('city:?:'),
      title: null, coverAssetId: null, note: null,
      createdAt: now, updatedAt: now, deletedAt: null,
    }],
  });
  return cityId;
}
