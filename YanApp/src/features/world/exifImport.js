// 言 · 从照片导入足迹
//
// 出发点:用户手机里有几万张照片,过去几年的旅行全在里面。手动一个个补录
// 是不现实的 —— 这也是「我记的 1 个」和「30,883 张照片」之间的落差。
//
// 但「读照片的 GPS 然后生成打卡」这个描述里藏着三个必须处理的现实:
//
//   1. 一次旅行会拍几百张照片,不能生成几百条打卡记录。
//      同一天、同一片区域的照片属于**同一次到访**,要先聚合。
//
//   2. 很多照片没有 GPS。截图、微信保存的图、别人发来的图,位置信息
//      要么从来没有、要么被抹掉了。这不是错误,是常态,要如实告诉用户。
//
//   3. 用户可能重复导入。第二次导入不该把上次的记录再来一遍。
//
// 这里只做纯计算,不碰相册也不碰网络 —— 聚合规则判错会让用户的旅行史
// 变成一堆重复或缺失的点,这种东西必须能测。

// 带 .js 后缀:Metro 不要求,但 node --test 的 ESM 解析要求。
// 这个模块要能在测试里跑,所以按更严的那边写。
import { NEAR_DEG } from './record.js';

/** 本地日期(不是 UTC)。在东京拍的照片应该算当天,不该因为时区退回前一天。 */
export function localDay(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 把相册资产normalize成计算用的点。没有坐标或没有时间的会被剔除,
 * 但**数量会被记下来** —— 用户需要知道「为什么 200 张只导入了 12 处」。
 */
export function extractPoints(assets = []) {
  const points = [];
  let missingLocation = 0;
  for (const a of assets) {
    const lat = a?.location?.latitude ?? a?.lat;
    const lng = a?.location?.longitude ?? a?.lng;
    const ts = a?.creationTime ?? a?.takenAt ?? a?.modificationTime;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { missingLocation += 1; continue; }
    const day = localDay(ts);
    if (!day) { missingLocation += 1; continue; }
    points.push({ id: a.id, lat, lng, day, takenAt: new Date(ts).getTime() });
  }
  return { points, missingLocation };
}

/**
 * 把照片聚成「一次到访」:同一天 + 相距 5km 以内 = 同一处。
 *
 * 为什么按天而不是按连续时间窗:用户对旅行的记忆单位是「哪天去了哪」,
 * 而不是「下午三点到五点在某个坐标」。按天聚合出来的结果,和他自己
 * 讲这段旅行的方式一致。
 */
export function groupIntoVisits(points = []) {
  const sorted = [...points].sort((a, b) => a.takenAt - b.takenAt);
  const visits = [];

  for (const p of sorted) {
    const hit = visits.find(v =>
      v.day === p.day &&
      Math.abs(v.lat - p.lat) < NEAR_DEG &&
      Math.abs(v.lng - p.lng) < NEAR_DEG);

    if (hit) {
      // 用均值收敛到这片区域的中心,而不是取第一张的坐标 ——
      // 第一张可能是刚下飞机在机场拍的
      hit.photoIds.push(p.id);
      hit.lat += (p.lat - hit.lat) / hit.photoIds.length;
      hit.lng += (p.lng - hit.lng) / hit.photoIds.length;
      if (p.takenAt < hit.firstAt) { hit.firstAt = p.takenAt; hit.coverId = p.id; }
    } else {
      visits.push({
        day: p.day, lat: p.lat, lng: p.lng,
        photoIds: [p.id], firstAt: p.takenAt, coverId: p.id,
      });
    }
  }
  return visits.sort((a, b) => a.firstAt - b.firstAt);
}

/**
 * 去掉已经记过的。
 * 判重条件和聚合一致:同一天 + 5km 以内。重复导入应该是安全的空操作。
 */
export function dedupeAgainstExisting(visits = [], existing = []) {
  const known = existing
    .filter(r => Number.isFinite(r?.lat) && Number.isFinite(r?.lng))
    .map(r => ({ lat: r.lat, lng: r.lng, day: r.visitedOn ? localDay(r.visitedOn) : null }));

  return visits.filter(v => !known.some(k =>
    k.day === v.day &&
    Math.abs(k.lat - v.lat) < NEAR_DEG &&
    Math.abs(k.lng - v.lng) < NEAR_DEG));
}

/**
 * 导入结果的人话摘要。
 *
 * 一无所获时必须说清是**哪一步**丢的 —— 用户知道自己的照片带定位,
 * 只说「没有位置信息」他会认为是 App 坏了(而且他多半是对的)。
 * 三种原因的修法完全不同:
 *   拿不到 assetId → iOS 只给了「限制访问」,要去设置里改成完全访问
 *   拿到了但相册没位置 → 照片本身确实没有(修过图、下载的图会丢 GPS)
 *   有位置但没时间 → 少见,通常是导出的图
 */
export function summarize({
  picked = 0, missingLocation = 0, imported = 0, skipped = 0, diag = null,
}) {
  const lines = [];
  if (imported > 0) lines.push(`新增 ${imported} 处足迹`);
  if (skipped > 0) lines.push(`${skipped} 处之前已经记过`);
  if (missingLocation > 0) {
    lines.push(`${missingLocation} 张没能读出位置`);
  }
  if (!lines.length) lines.push(`选了 ${picked} 张,一张都没能读出位置`);

  if (diag && missingLocation > 0) {
    if (!diag.withAssetId) {
      lines.push('\n原因:系统没有把照片的相册标识给言 —— 通常是照片权限只给了「限制访问」。到 设置 → 言 → 照片,改成「完全访问」再试。');
    } else if (!diag.fromLibrary && !diag.fromExif) {
      lines.push('\n原因:相册里这些照片本身没有位置。修过图、从网上或大疆等设备下载的图,GPS 通常已被去掉。');
    } else if (diag.noTime) {
      lines.push(`\n其中 ${diag.noTime} 张有位置但读不到拍摄时间,无法归到某一天。`);
    }
  }
  return lines.join('\n');
}
