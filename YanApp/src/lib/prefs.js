// 言 · 显示偏好
//
// 目前只有一项:复习/词卡要不要并列显示英文释义。
//
// 为什么值得单开一个文件而不是塞进某个组件的 useState:
// 偏好要跨屏一致(复习页开了、词卡页也得是开的),而且要落盘。
// 散在各处的结果和 storage.js 开头列的那三次事故是同一个形状。
import { useCallback, useEffect, useState } from 'react';

import { K, readJsonResult, writeJson } from './storage';
import { createWriteGuard } from './writeGuard';

/**
 * 默认开。
 *
 * 理由不是「英文更好」,是**中文那 6 个字装不下的信息,英文那 41 个字装得下**
 * —— 实测词库里英文释义平均 41 字符、中文 6 字符,7616/8005 条英文长 2 倍以上,
 * 3017 条带 `|` 的多义项分隔。功能词尤其明显:
 *
 *     だけ   zh「只,仅;到……程度」
 *            en「only; just; merely | as much as; to the extent of」
 *
 * 中文把两个义项压成一行,英文分开了。
 *
 * 但**必须能关**:不看英文的用户,这一行就是纯噪音。
 */
export const DEFAULTS = { showEnglish: true };

/**
 * 读一份偏好。
 *
 * 读盘失败时**不写回**(见 writeGuard)—— 偏好虽然不值钱,但同一个洞
 * 在这个项目里已经吃过四次,没有理由在新代码里再开一个。
 */
export function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [guard] = useState(() => createWriteGuard(K.prefs));

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await readJsonResult(K.prefs);
      if (!alive) return;
      guard.onRead({ ok: r.ok });
      // 读失败就用默认值显示,但下面 set 时会被护栏挡住,不会写回去
      if (r.ok && r.value && typeof r.value === 'object') {
        setPrefs({ ...DEFAULTS, ...r.value });
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [guard]);

  const set = useCallback((patch) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      if (guard.allow()) writeJson(K.prefs, next);
      return next;
    });
  }, [guard]);

  return { prefs, ready, set };
}
