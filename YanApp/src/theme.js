// 言 YAN · 共享色板
// 从 App.js 抽出,供各 feature 组件复用(避免各处重复定义)。
export const C = {
  ink: '#0e0e12', paper: '#f5f2ec', lava: '#d4401a', lavaLight: '#fce8e0',
  lavaMid: '#f0b8a0', gold: '#c9a84c', blue: '#2d5fa0', blueLight: '#e6eef8',
  teal: '#2a7a6a', tealLight: '#e0f0ec', purple: '#5a3a9a', purpleLight: '#eeebff',
  white: '#ffffff', muted: '#888888', mutedLight: '#bbbbbb', border: '#e8e4dc',
  tag: '#f0ede6', dark2: '#1a1a2e',
  // ── 从 App.js 收编的高频硬编码色(值完全不变,只是给了名字)──
  // 收编标准:出现 ≥4 次。只出现一两次的一次性色留在原处,硬塞进色板反而是噪音。
  // 注意:仓库里还有 278 对「距离 <8 肉眼难辨却是两个值」的近似色
  // (如 #eee7df / #efe7df、#8f8379 / #8f837a),多半是复制粘贴漂移。
  // 合并它们会改变渲染结果,需要视觉回归验证后再做,这里不动。
  borderSoft: '#eee7df',   // 浅暖分隔线(最常用的一根线)
  borderWarm: '#eaded4',   // 偏暖的卡片描边
  paperLight: '#fffaf5',   // 近白暖底
  paperWarm: '#fffaf0',    // 更暖一档的底
  paperFaint: '#fcfbf8',   // 几乎纯白的底
  mutedWarm: '#8f8379',    // 暖灰正文次级色
  clay: '#c97845',         // 陶土色强调字
  goldInk: '#8a6a10',      // 金褐色强调字(离线提示等)
  blueInk: '#3D5FA0',      // 蓝色链接字(注意与 C.blue #2d5fa0 是两个值)
  blueFaint: '#EBEEf8',    // 浅蓝底
  // 地铁模块的暗色系
  night: '#1e1e3a',
  nightLine: '#2a2a4a',
  nightMuted: '#5a5a7a',
  nightMutedLight: '#7a7aa0',
};
