// 言 · 手写体字库(按需下载)
//
// 霞鹜文楷 24MB。**不打进包** —— 那是一整个 App 大小的量级,而且绝大多数用户
// 打开言的第一天不会碰手账。走远端按需下,和内容包同一条管线(同一个仓库、
// 同样 raw.githubusercontent),下完落文件系统,以后冷启动直接用本地那份。
//
// 为什么值得一个 24MB 的字库:它一套覆盖 46490 字 —— 中文 + 假名 + 日语汉字
// + 西语重音和 ¿¡ + 生僻字。言不是只做日语,每加一门语言再配一套字体是不可持续的。
// 授权是 SIL OFL,明确允许嵌入软件分发 —— 判据是 OFL,不是「免费商用」四个字,
// 后者常常只覆盖平面设计,嵌进 App 属于 embedding,要另外授权。
//
// 硬规矩 1(拿不到数据 ≠ 数据是空的)在这里的形态:
// 下载失败、加载失败一律**回退系统字**,手账照常能打开、能写字、能存。
// 字体是锦上添花,不是能不能用的前提 —— 任何让「没下到字体就用不了手账」的写法都是错的。
import * as FileSystem from 'expo-file-system/legacy';
import * as Font from 'expo-font';

/** 字体家族名。业务代码写 fontFamily: JOURNAL_FONT,别再手写字符串。 */
export const JOURNAL_FONT = 'LXGWWenKai';

// 版本进文件名:换版本 = 换文件名,老文件自然失效,不需要写「清缓存」那套逻辑。
const VERSION = 'v1.522';
const FILE_NAME = `LXGWWenKai-Regular-${VERSION}.ttf`;

// ⚠️ 上线前必须换成我们自己的镜像。
//
// 现在指向上游的 GitHub Release,好处是**今天就能测**,零配置。
// 但生产环境不能依赖第三方的发布页 —— 人家删个 release,所有新用户的手账就没字体了。
//
// 为什么不放进 yan-content 仓库:24MB 会永久留在 git 历史里,每个人 clone 都要背。
// 正确的镜像方式是发一个我们自己的 Release(附件不进仓库历史,URL 一样稳定):
//   gh release create fonts-v1 <本地 ttf> --repo YSY929YSY/yan-content
// 然后把这个常量换成那个 URL。
const REMOTE_URL =
  'https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf';

const localPath = () => `${FileSystem.documentDirectory}${FILE_NAME}`;

let loaded = false;          // 本次进程里已经 loadAsync 过
let inflight = null;         // 正在下/正在加载,别并发下两遍 24MB

export const isJournalFontLoaded = () => loaded;

async function ensureFile() {
  const path = localPath();
  const info = await FileSystem.getInfoAsync(path);
  // 只认「存在且不是空文件」:断网断在一半会留下一个 0 字节的壳,
  // 那个壳会让 loadAsync 每次都失败,而且永远不会被重下 —— 必须当成没有。
  if (info.exists && info.size > 1024 * 1024) return path;
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });

  const { status } = await FileSystem.downloadAsync(REMOTE_URL, path);
  if (status !== 200) {
    await FileSystem.deleteAsync(path, { idempotent: true });
    throw new Error(`下载失败 HTTP ${status}`);
  }
  return path;
}

/**
 * 确保手写体可用。
 *
 * @returns {{ ok: boolean, error: string|null }}
 *   ok=false 时调用方**什么都不用做** —— 界面回退系统字即可,不要弹窗、不要拦住用户。
 */
export async function ensureJournalFont() {
  if (loaded) return { ok: true, error: null };
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const path = await ensureFile();
      await Font.loadAsync({ [JOURNAL_FONT]: path });
      loaded = true;
      return { ok: true, error: null };
    } catch (e) {
      console.warn('[Font] 手写体加载失败,回退系统字:', e?.message);
      return { ok: false, error: e?.message || 'unknown' };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * 字体没到位时的回退。
 * 传 null 给 fontFamily = 用系统字,这正是我们要的 —— 不要传一个不存在的家族名,
 * Android 上那样会渲染成方块。
 */
export const journalFontFamily = () => (loaded ? JOURNAL_FONT : undefined);
