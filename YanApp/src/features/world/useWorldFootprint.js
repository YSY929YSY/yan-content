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

import { K, readJson, writeJson } from '../../lib/storage';
import { pullPlaceCheckins, pushPlaceCheckin, uploadPlaceCheckinPhoto } from '../../lib/sync';
import {
  listUserPlaces, addUserPlace, removeUserPlace, updateUserPlace,
} from '../../lib/userPlaces';
import { fromCustom } from './record';
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

  const mapPoints = buildMapPoints(places, myPlaces, { visitedIds, checkinDates });

  // 自己记的地点 → 统一记录。坐标撞上收录点的,会在这里拿到那份内容。
  const customRecords = myPlaces.map(mp => fromCustom(mp, initialPlaces, { photoUris }));

  return {
    places, visitedIds, checkinDates, placeNotes, photoUris, photoPaths, myPlaces,
    mapPoints, customRecords,
    checkIn, saveNote, toggleStatus, pickPhoto,
    addPlace, removePlace, updatePlace, pickPhotoForCustom,
  };
}
