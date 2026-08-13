// 纸样的元数据。和图片分开,是因为这些值影响**内容规则**,不只是显示:
//
// darkInk=false 的纸上,黑墨读不出来 —— 笔的默认色必须跟着纸走。
// 这是从参考实物上量出来的硬约束,不是审美偏好:深牛皮上写黑字,拍出来就是一团。
// 同理 photoFrame:牛皮底会把彩色照片压脏,所以牛皮纸上照片默认带白边。
export const PAPERS_META = {
  'kraft-light': { label: '牛皮 · 浅', darkInk: true,  photoFrame: 'white' },
  'kraft-bag':   { label: '牛皮 · 纸袋', darkInk: true,  photoFrame: 'white' },
  'kraft-dark':  { label: '牛皮 · 深', darkInk: false, photoFrame: 'white' },
};

/** 这张纸上,笔的默认颜色。深纸上给米白,浅纸上给墨褐。 */
export const defaultInkColor = (paperKey) =>
  (PAPERS_META[paperKey]?.darkInk === false ? '#f0e6d2' : '#3a2c1e');
