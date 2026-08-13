// 内置纸样。
//
// 单独一个文件,是因为 require 图片只有 Metro 认;journalRender.js 要能在
// node --test 里直接跑,不能被这几行拖下水。
//
// 这几张是程序化生成的(tools 里那套:纤维 → 草梗 → 云斑 → 整页揉痕 → 边缘磨损 → 污渍),
// 不是拍的也不是下载的 —— 版权干净,换 seed 就是一张全新的纸。
import { PAPERS_META } from './journalPapersMeta';

export const PAPERS = {
  'kraft-light': require('../../../assets/paper/kraft-light.jpg'),
  'kraft-bag': require('../../../assets/paper/kraft-bag.jpg'),
  'kraft-dark': require('../../../assets/paper/kraft-dark.jpg'),
};

export const PAPER_KEYS = Object.keys(PAPERS);
export { PAPERS_META };
