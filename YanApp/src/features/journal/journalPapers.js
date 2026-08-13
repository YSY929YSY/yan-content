// 内置纸样。
//
// 单独一个文件,是因为 require 图片只有 Metro 认;journalRender.js 要能在
// node --test 里直接跑,不能被这几行拖下水。
//
// 这几张是程序化生成的(`scripts/generate-paper.py`:纤维 → 草梗 → 云斑 →
// 边缘磨损 → 光照不均,带格线的再叠一层印刷墨),不是拍的也不是下载的 ——
// 版权干净,换 seed 就是一张全新的纸。
//
// ⚠️ **只 require 真要用的那几张。** `assets/paper/` 里生成了九档
// (素白/米黄/浅灰 · 点阵/方格/横线 · 牛皮三档),全打进包是 4.4MB。
// 想换档就改这里,别图省事全列上。
import { PAPERS_META } from './journalPapersMeta';

export const PAPERS = {
  'plain-cream': require('../../../assets/paper/plain-cream.jpg'),
  'dot-cream': require('../../../assets/paper/dot-cream.jpg'),
  'grid-ivory': require('../../../assets/paper/grid-ivory.jpg'),
  // 牛皮留一档。它是**另一种风格**,不是「更旧的那一版」——
  // 揉皱和污渍拉满的那种纸有它的场合,只是不该当默认
  'kraft-bag': require('../../../assets/paper/kraft-bag.jpg'),
};

export const PAPER_KEYS = Object.keys(PAPERS);

/**
 * 没指定 bg 时,自动挑纸只在**这个池子**里挑。
 *
 * 全部 PAPER_KEYS 一起挑的话,一页会随机落到牛皮上 —— 而牛皮和素纸是两种
 * 完全不同的调子,连着翻几页就成了大杂烩。牛皮要用,靠用户自己选。
 *
 * (`pickPaper` 是按页 id 稳定哈希的,不是随机 —— 每次打开换一张纸,
 *  那就不是一本本子了。见 journalRender.pickPaper。)
 */
export const PAPER_DEFAULTS = ['plain-cream', 'dot-cream', 'grid-ivory'];

export { PAPERS_META };
