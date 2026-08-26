// 言 · 本机纠错记录
// 不联网、不进内容包。每条记录占 JSONL 的一行，留在 App 的 documentDirectory。
import * as FileSystem from 'expo-file-system/legacy';
import { appendJsonlRecord } from './correctionsModel';

export const CORRECTIONS_FILE_NAME = 'yan_corrections_v1.jsonl';

export const correctionsFilePath = () =>
  `${FileSystem.documentDirectory || ''}${CORRECTIONS_FILE_NAME}`;

export async function saveCorrection(record) {
  const path = correctionsFilePath();
  return appendJsonlRecord({
    readText: async () => {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return '';
      return FileSystem.readAsStringAsync(path);
    },
    writeText: (text) => FileSystem.writeAsStringAsync(path, text),
  }, record);
}
