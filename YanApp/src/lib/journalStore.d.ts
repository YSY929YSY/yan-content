/**
 * journalStore.js 的类型声明。
 *
 * 那份文件是 JS,JSDoc 里 `@returns {{ asset: object|null }}` 只到 `object`,
 * TS 侧拿不到 id/width/height。**在调用点写 `as any` 会把整条链的类型都放掉**,
 * 所以在这里一次性声明清楚。
 *
 * ⚠️ 这份声明是手写的,不会自动跟着 .js 变。改 journalStore 的返回结构时
 * 要同步改这里 —— 否则 tsc 会「通过」一个已经不存在的形状。
 */

export type StoredAsset = {
  id: string;
  kind: string;
  entry: string;
  /** 文件名或路径,取 uri 要走 assetUri() —— iOS 容器 UUID 每次装应用都变 */
  localUri: string;
  width: number;
  height: number;
  cityId?: string | null;
  createdAt?: string | null;
  deletedAt?: string | null;
};

/** 失败返回 error 而不是 null —— 拿不到 ≠ 是空的,调用方要能区分取消和出错。 */
export function importAsset(
  uri: string,
  opts?: { kind?: string; entry?: string; width?: number; height?: number; cityId?: string | null },
): Promise<{ asset: StoredAsset | null; error: string | null }>;

export function assetUri(asset: StoredAsset): string;

/** ok 为 false 表示**读失败**,不是「没有素材」。当成空的会覆盖掉整个素材库。 */
export function readAssets(): Promise<{ ok: boolean; assets: StoredAsset[] }>;
export function readAll(): Promise<any>;
export function readMoments(): Promise<{ ok: boolean; moments: any[] }>;
export function readTags(): Promise<{ ok: boolean; tags: any[] }>;
export function readJournal(): Promise<{ ok: boolean; pages: any[]; cities: any[] }>;
export function writeAssets(assets: StoredAsset[]): Promise<boolean>;
