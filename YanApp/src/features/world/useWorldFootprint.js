// 言 · 世界足迹的状态与持久化
//
// 为什么要有这个 hook:在这之前,足迹的 6 份数据(去过的 id、打卡日期、手账备注、
// 本机照片 uri、云端照片路径、自定义地点)散成 NaTab 里的 6 个 useState,
// 每一处 setState 旁边都要有人记得手写一句 AsyncStorage.setItem。
//
// 结果是可预测的:总有几处忘了写。
//   · checkinDates 忘了 → 旅迹画不出来
//   · placeNotes 忘了   → 断网写的手账重开就没
// 两次都不是「写错了」,是「没写」—— 而代码本身对此毫无意见。
//
// 这里换一个机制:落盘不再是调用方的责任,而是状态本身的属性。
// 用 usePersistedState 声明的状态,任何一次 set 都会自动落盘;
// 需要「只放内存不落盘」的(云端签名 URL)必须显式走 setInMemory ——
// 从「忘了就丢数据」变成「想不落盘得专门说」。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import { K, readJson, writeJson } from '../../lib/storage';
import { pullPlaceCheckins, pushPlaceCheckin, uploadPlaceCheckinPhoto } from '../../lib/sync';
import {
  listUserPlaces, addUserPlace, removeUserPlace, updateUserPlace,
} from '../../lib/userPlaces';
import { fromCurated, fromCustom } from './record';
import { countriesOf, countryStats } from '../../lib/country';
import {
  extractPoints, groupIntoVisits, dedupeAgainstExisting, summarize,
} from './exifImport';
import { reverseGeocode } from '../../lib/geocode';
import {
  splitCloudCheckins, mergeMap, mergeIds, sanitizeVisitedIds, buildMapPoints,
} from './footprintMerge';

/**
 * 一份「写了就落盘」的状态。
 *
 * @param storageKey  storage.js 里登记过的键
 * @param initial     初值
 * @param merge       (磁盘上的, 内存里的) => 合并结果。默认本地内存优先(见 footprintMerge 规矩 2)
 * @returns [值, set(会落盘), setInMemory(不落盘)]
 */
function usePersistedState(storageKey, initial, merge = mergeMap) {
  const [value, setValue] = useState(initial);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const saved = await readJson(storageKey, null);
      if (!alive.current || saved == null) return;
      // 读盘是异步的,期间云端那份可能已经先到了 —— 合并而不是覆盖
      setValue(prev => merge(saved, prev));
    })();
    return () => { alive.current = false; };
    // merge 由调用方以模块级常量传入,不会变;storageKey 同理
  }, [storageKey]);

  const set = useCallback((updater) => {
    setValue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeJson(storageKey, next);          // 落盘失败只 warn,不影响这次交互
      return next;
    });
  }, [storageKey]);

  // 显式的「不落盘」通道。目前只有一个正当用途:云端返回的签名 URL,
  // 一小时就过期,落盘会让下次冷启动满屏裂图。
  const setInMemory = useCallback((updater) => {
    setValue(prev => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  return [value, set, setInMemory];
}

export function useWorldFootprint(initialPlaces) {
  const [visitedIds, setVisitedIds] = usePersistedState(K.worldVisitedIds, [], (saved, prev) =>
    // 冷启动时 prev 是空的,取磁盘那份;云端已先到则取并集
    (prev && prev.length ? mergeIds(sanitizeVisitedIds(saved), prev) : sanitizeVisitedIds(saved))
  );
  const [checkinDates, setCheckinDates] = usePersistedState(K.worldCheckinDates, {});
  const [placeNotes, setPlaceNotes] = usePersistedState(K.worldPlaceNotes, {});
  const [photoPaths, setPhotoPaths] = usePersistedState(K.worldPhotoPaths, {});
  const [photoUris, setPhotoUris, setPhotoUrisInMemory] = usePersistedState(K.worldPhotos, {});
  const [myPlaces, setMyPlaces] = useState([]);

  // 精选地点带上「去过/想去」。内容变了或打卡变了都要重算。
  const [places, setPlaces] = useState(() => initialPlaces.map(p => ({ ...p, status: 'wish' })));
  useEffect(() => {
    const visited = new Set(visitedIds);
    setPlaces(initialPlaces.map(p => ({ ...p, status: visited.has(p.id) ? 'been' : 'wish' })));
  }, [initialPlaces, visitedIds]);

  // 本地存档版本号。和打卡一起写,用于将来做迁移时判断磁盘格式。
  useEffect(() => { writeJson(K.worldMeta, { storageVersion: 1 }); }, []);

  useEffect(() => { listUserPlaces().then(setMyPlaces).catch(() => {}); }, []);

  // 云端合并。失败(splitCloudCheckins 返回 ok:false)时一个字段都不动 ——
  // 「拿不到」和「是空的」必须分开,混淆过一次就会清空用户的记录。
  useEffect(() => {
    let alive = true;
    (async () => {
      const cloud = await pullPlaceCheckins();
      if (!alive) return;
      const c = splitCloudCheckins(cloud, new Set(initialPlaces.map(p => p.id)));
      if (!c.ok) return;

      if (c.visitedIds.length) setVisitedIds(prev => mergeIds(c.visitedIds, prev));
      if (Object.keys(c.dates).length) setCheckinDates(prev => mergeMap(c.dates, prev));
      if (Object.keys(c.notes).length) setPlaceNotes(prev => mergeMap(c.notes, prev));
      if (Object.keys(c.photoPaths).length) setPhotoPaths(prev => mergeMap(c.photoPaths, prev));
      // 签名 URL:只进内存,不落盘
      if (Object.keys(c.photoUris).length) {
        setPhotoUrisInMemory(prev => ({ ...prev, ...c.photoUris }));
      }
    })();
    return () => { alive = false; };
  }, [initialPlaces, setVisitedIds, setCheckinDates, setPlaceNotes, setPhotoPaths, setPhotoUrisInMemory]);

  // ── 动作 ──────────────────────────────────────────────────
  // 一律「先本地后云端」:本地是用户当下看到的结果,云端失败不该让操作看起来没生效。

  const checkIn = useCallback((place) => {
    const now = new Date().toISOString();
    setCheckinDates(prev => ({ ...prev, [place.id]: now }));
    setVisitedIds(prev => (prev.includes(place.id) ? prev : [...prev, place.id]));
    pushPlaceCheckin(place.id, 'been', { photoPath: photoPaths[place.id], checkedInAt: now })
      .catch(e => console.warn('[WorldFootprints] check-in sync failed', e));
  }, [photoPaths, setCheckinDates, setVisitedIds]);

  /**
   * 改精选地点的到访日期。
   *
   * 为什么必须能改:打卡写的是「打卡那一刻」,而用户常常是回来之后一次性补录 ——
   * 十个地方的日期全变成同一天,旅迹就成了「今天飞遍全球」。
   * 自定义地点一直可以填到访日期,精选地点不能,这个不一致本身就是缺陷。
   *
   * @param dayOrNull 'YYYY-MM-DD';传空表示清掉日期
   */
  const setVisitedOn = useCallback((placeId, day) => {
    // 存 ISO 时间戳,和打卡写入的格式保持一致(旅迹按它排序)
    const iso = day ? new Date(`${day}T12:00:00`).toISOString() : null;
    setCheckinDates(prev => {
      const next = { ...prev };
      if (iso) next[placeId] = iso; else delete next[placeId];
      return next;
    });
    pushPlaceCheckin(placeId, 'been', { checkedInAt: iso })
      .catch(e => console.warn('[WorldFootprints] date sync failed', e));
  }, [setCheckinDates]);

  const saveNote = useCallback((placeId, text) => {
    const note = (text ?? '').trim();
    setPlaceNotes(prev => ({ ...prev, [placeId]: note }));
    pushPlaceCheckin(placeId, 'been', { note })
      .catch(e => console.warn('[WorldFootprints] note sync failed', e));
  }, [setPlaceNotes]);

  const toggleStatus = useCallback((placeId) => {
    const nextStatus = visitedIds.includes(placeId) ? 'wish' : 'been';
    setVisitedIds(prev => (
      prev.includes(placeId) ? prev.filter(id => id !== placeId) : [...prev, placeId]
    ));
    pushPlaceCheckin(placeId, nextStatus, { photoPath: photoPaths[placeId] })
      .catch(e => console.warn('[WorldFootprints] Failed to sync place status', e));
  }, [visitedIds, photoPaths, setVisitedIds]);

  const pickPhoto = useCallback(async (placeId) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无法访问照片', '你可以在系统设置中允许“言”访问照片后，再上传打卡照片。',
        [{ text: '知道了' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    setPhotoUris(prev => ({ ...prev, [placeId]: asset.uri }));

    const upload = await uploadPlaceCheckinPhoto(placeId, asset.uri, asset.mimeType || 'image/jpeg');
    if (!upload?.photoPath) return;
    setPhotoPaths(prev => ({ ...prev, [placeId]: upload.photoPath }));
    await pushPlaceCheckin(placeId, visitedIds.includes(placeId) ? 'been' : 'wish',
      { photoPath: upload.photoPath });
  }, [visitedIds, setPhotoUris, setPhotoPaths]);

  const addPlace = useCallback(async (input) => {
    const { place } = await addUserPlace(input);
    if (place) setMyPlaces(prev => [place, ...prev]);
    return place;
  }, []);

  const removePlace = useCallback(async (id) => {
    setMyPlaces(prev => prev.filter(p => p.id !== id));
    await removeUserPlace(id);
  }, []);

  /** 改自己记的地点(备注、到访日期)。先本地生效,云端失败也不回滚。 */
  const updatePlace = useCallback(async (id, patch) => {
    setMyPlaces(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
    await updateUserPlace(id, patch);
  }, []);

  /**
   * 给自己记的地点传照片。
   *
   * 走的是和精选地点同一个 Storage 桶、同一套路径约定({uid}/{id}.jpg),
   * 因为它们本来就是同一种东西 —— 一条打卡记录的照片。
   * 自定义 id 是 uuid,精选 id 是短横线 slug,不会撞。
   */
  const pickPhotoForCustom = useCallback(async (id) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无法访问照片', '你可以在系统设置中允许“言”访问照片后，再上传打卡照片。',
        [{ text: '知道了' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    // 本机 uri 先上屏(离线也看得见),再尝试上云
    setPhotoUris(prev => ({ ...prev, [id]: asset.uri }));

    const upload = await uploadPlaceCheckinPhoto(id, asset.uri, asset.mimeType || 'image/jpeg');
    if (!upload?.photoPath) return;
    await updatePlace(id, { photoPath: upload.photoPath });
  }, [setPhotoUris, updatePlace]);

  /**
   * 从照片导入足迹。
   *
   * 为什么让用户自己挑照片,而不是自动扫全相册:
   *   一是隐私 —— 「言想读你 30,883 张照片的位置」和「你选这几张」是两件事;
   *   二是现实 —— 逐张读位置要调 getAssetInfoAsync,几万张会跑到天荒地老。
   *
   * 位置优先取 MediaLibrary 的 location:iOS 上 ImagePicker 返回的 EXIF
   * 常常已经被系统抹掉 GPS,而 MediaLibrary 配合 ACCESS_MEDIA_LOCATION 才拿得到。
   */
  const importFromPhotos = useCallback(async ({ onProgress } = {}) => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('需要照片权限',
        '言要读照片的拍摄时间和地点来补全足迹。你可以在系统设置里允许后再试。',
        [{ text: '知道了' }]);
      return null;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 200,          // 一次几百张已经够一趟旅行,再多只会更慢
      exif: true,
    });
    if (picked.canceled || !picked.assets?.length) return null;

    onProgress?.({ phase: 'reading', done: 0, total: picked.assets.length });

    // 逐张补齐位置。ImagePicker 给的 assetId 才能查到相册里的原始信息。
    //
    // 每一步都计数:位置读不到的原因有好几种(没给 assetId、相册查不到、
    // EXIF 被抹掉),它们的修法完全不同。只报「没有位置信息」等于什么都没说 ——
    // 用户明明知道自己的照片是带定位的。
    const diag = {
      withAssetId: 0, fromLibrary: 0, fromExif: 0, noTime: 0, infoFailed: 0,
      locUnusable: 0,   // 有 location 对象但经纬度取不出有效数字
    };
    const uriById = new Map();
    const assets = [];
    for (let i = 0; i < picked.assets.length; i += 1) {
      const a = picked.assets[i];
      let loc = null;
      let time = null;
      const raw = a.exif?.DateTimeOriginal || a.exif?.DateTime;
      // EXIF 的时间格式是 "2026:03:01 12:00:00",Date.parse 认不了前面那两个冒号
      if (raw) {
        const t = Date.parse(String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
        if (!Number.isNaN(t)) time = t;
      }
      if (a.assetId) {
        diag.withAssetId += 1;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a.assetId);
          if (info?.location) {
            // 有对象不等于有坐标 —— 分开计数,否则「读到了位置却用不了」
            // 会被算成成功,诊断反而误导人
            if (Number.isFinite(info.location.latitude) && Number.isFinite(info.location.longitude)) {
              loc = info.location;
              diag.fromLibrary += 1;
            } else {
              diag.locUnusable += 1;
            }
          }
          if (info?.creationTime) time = info.creationTime;
        } catch { diag.infoFailed += 1; }
      }
      if (!loc && Number.isFinite(a.exif?.GPSLatitude) && Number.isFinite(a.exif?.GPSLongitude)) {
        loc = { latitude: a.exif.GPSLatitude, longitude: a.exif.GPSLongitude };
        diag.fromExif += 1;
      }
      if (loc && !time) diag.noTime += 1;
      const id = a.assetId || a.uri;
      uriById.set(id, a.uri);          // 生成记录后要拿它当封面
      assets.push({ id, location: loc, creationTime: time });
      onProgress?.({ phase: 'reading', done: i + 1, total: picked.assets.length });
    }
    console.log('[EXIF] diag', JSON.stringify(diag));

    const { points, missingLocation } = extractPoints(assets);
    const visits = groupIntoVisits(points);
    const fresh = dedupeAgainstExisting(visits, myPlaces);
    const skipped = visits.length - fresh.length;

    // 反查地名。Nominatim 限速每秒 1 次,geocode.js 里已经排了队,
    // 这里只需要如实报进度 —— 十几个点要等十几秒,不说的话像卡死了。
    let imported = 0;
    for (let i = 0; i < fresh.length; i += 1) {
      const v = fresh[i];
      onProgress?.({ phase: 'naming', done: i, total: fresh.length });
      const hit = await reverseGeocode(v.lat, v.lng);
      const place = await addPlace({
        name: hit?.name || `${v.lat.toFixed(2)}, ${v.lng.toFixed(2)}`,
        city: hit?.city || '',
        country: hit?.country || '',
        lat: v.lat,
        lng: v.lng,
        note: '',
        visitedOn: v.day,
      });
      if (!place) continue;
      imported += 1;

      // 把照片挂上去。少了这一步,导入出来的记录点开是空的 ——
      // 用户明明是「用这张照片」生成的它。
      const coverUri = uriById.get(v.coverId);
      if (coverUri) {
        setPhotoUris(prev => ({ ...prev, [place.id]: coverUri }));
        // 上传失败不回滚:本机 uri 已经能看,换机时再补也不迟
        uploadPlaceCheckinPhoto(place.id, coverUri, 'image/jpeg')
          .then(up => { if (up?.photoPath) updatePlace(place.id, { photoPath: up.photoPath }); })
          .catch(e => console.warn('[EXIF] cover upload failed', e?.message));
      }
    }
    onProgress?.({ phase: 'done', done: fresh.length, total: fresh.length });

    return {
      imported, skipped, missingLocation, picked: picked.assets.length, diag,
      message: summarize({ picked: picked.assets.length, missingLocation, imported, skipped, diag }),
    };
  }, [myPlaces, addPlace]);

  const mapPoints = buildMapPoints(places, myPlaces, { visitedIds, checkinDates });

  // 点亮了几个国家 —— 精选和自己记的合在一起算,因为它们本来就是同一种记录。
  const allRecords = [
    ...initialPlaces.map(p => fromCurated(p, { visitedIds })),
    ...myPlaces.map(mp => fromCustom(mp, [])),
  ];
  const countries = countriesOf(allRecords);
  // 连未点亮的一起给 —— 「25 个国家」是死数字,「日本还有 6 个地方没去」才能行动
  const countryRows = countryStats(allRecords);

  // 自己记的地点 → 统一记录。坐标撞上收录点的,会在这里拿到那份内容。
  const customRecords = myPlaces.map(mp => fromCustom(mp, initialPlaces, { photoUris }));

  return {
    places, visitedIds, checkinDates, placeNotes, photoUris, photoPaths, myPlaces,
    mapPoints, customRecords, countries, countryRows,
    checkIn, saveNote, toggleStatus, pickPhoto, setVisitedOn,
    addPlace, removePlace, updatePlace, pickPhotoForCustom, importFromPhotos,
  };
}
