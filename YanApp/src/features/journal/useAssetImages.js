// 一页上任意多个素材的图片加载。
//
// ## 为什么不用 useImage
//
// `useImage` 是 hook,**不能在循环里调** —— 而一页手账上有几个元素是用户决定的,
// 不是写死的。之前那版预演屏只能放一张照片,根本原因就在这儿:
// 我按「hook 只能调固定次数」把页面写成了固定结构,于是「空白页 + 自己往上加」
// 这个产品定案根本落不了地(docs/travel-moments-design.md 第四节)。
//
// 所以改成命令式:`Skia.Data.fromURI` + `MakeImageFromEncoded`,
// 想加载几张加载几张,结果放 state。
import { useEffect, useRef, useState } from 'react';
import { Skia } from '@shopify/react-native-skia';

/**
 * @param assets 素材记录数组,每条要有 `id` 和一个可解码的 uri
 * @param uriOf  (asset) => uri。单独传是因为路径要现拼(见 journalStore.assetUri)
 * @returns {{ images: Record<id, SkImage>, loading: boolean, failed: string[] }}
 */
export function useAssetImages(assets, uriOf) {
  const [images, setImages] = useState({});
  const [failed, setFailed] = useState([]);
  // 已经解过的不重解。解一张 1600px 的图是几十毫秒,一页十几张就是肉眼可见的卡顿,
  // 而元素每拖一下就重渲一次 —— 不缓存的话拖动时会疯狂重解。
  const cache = useRef(new Map());
  const [pending, setPending] = useState(0);

  const list = assets || [];
  const sig = list.map(a => a.id).join('|');

  useEffect(() => {
    let alive = true;
    const want = list.filter(a => a?.id && !cache.current.has(a.id));
    if (!want.length) {
      // 数量变了(比如删掉一个)也要同步一次 —— 否则删掉的那张还留在 images 里
      const next = {};
      for (const a of list) {
        const img = cache.current.get(a.id);
        if (img) next[a.id] = img;
      }
      setImages(next);
      return;
    }
    setPending(n => n + want.length);
    (async () => {
      for (const a of want) {
        const uri = uriOf ? uriOf(a) : a.localUri;
        let img = null;
        try {
          const data = uri ? await Skia.Data.fromURI(uri) : null;
          img = data ? Skia.Image.MakeImageFromEncoded(data) : null;
        } catch {
          img = null;
        }
        if (!alive) return;
        // 解不出来也记进缓存(记成 null),否则每次渲染都会重试一张坏图
        cache.current.set(a.id, img);
        if (!img) setFailed(f => (f.includes(a.id) ? f : [...f, a.id]));
        setPending(n => Math.max(0, n - 1));
      }
      if (!alive) return;
      const next = {};
      for (const a of list) {
        const img = cache.current.get(a.id);
        if (img) next[a.id] = img;
      }
      setImages(next);
    })();
    return () => { alive = false; };
    // sig 只随「有哪些 id」变。素材记录本身改了(比如拖动改了坐标)不该重新解码
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return { images, loading: pending > 0, failed };
}
