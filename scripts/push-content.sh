#!/bin/bash
# 把 develop/v2 上的最新 content.v2.json 推送到 origin/main（App 读的地方）
# 用法：bash scripts/push-content.sh
#
# 发布前请先在 develop/v2 上跑：bash tools/check-content-release.sh
# Blocker 为 0 再执行本脚本。
# 默认会要求人工确认 develop/v2 提交里的词条数与词场数；自动化调用可传 --yes。

set -e

ASSUME_YES=0
if [ "$#" -gt 1 ]; then
  echo "用法：bash scripts/push-content.sh [--yes]"
  exit 2
elif [ "${1:-}" = "--yes" ]; then
  ASSUME_YES=1
elif [ -n "${1:-}" ]; then
  echo "✗ 未知参数：$1"
  echo "用法：bash scripts/push-content.sh [--yes]"
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT_BRANCH=$(git -C "$REPO_ROOT" branch --show-current)
TMP_JSON=$(mktemp)

# 无论成功、失败还是被钩子拒绝，都要回到原分支。
# 旧版没有这一步：push 被拒时 set -e 直接中断，人被留在 main 上还带着
# 一个未推送的提交，很容易接着误操作。
cleanup() {
  local code=$?
  rm -f "$TMP_JSON"
  local now
  now=$(git -C "$REPO_ROOT" branch --show-current)
  if [ -n "$CURRENT_BRANCH" ] && [ "$now" != "$CURRENT_BRANCH" ]; then
    echo "→ 回到 $CURRENT_BRANCH"
    git -C "$REPO_ROOT" checkout "$CURRENT_BRANCH" >/dev/null 2>&1 || true
    # 发布失败时把本地 main 复位，别留下悬空提交
    if [ "$code" -ne 0 ]; then
      git -C "$REPO_ROOT" branch -f main origin/main >/dev/null 2>&1 || true
      echo "→ 已复位本地 main（发布未完成）"
    fi
  fi
  exit $code
}
trap cleanup EXIT

echo "→ 当前分支：$CURRENT_BRANCH"

# 工作区必须干净：切分支会把未提交改动带过去
if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
  echo "✗ 有未提交的改动，先提交或 stash 再发布"
  git -C "$REPO_ROOT" status --short --untracked-files=no | sed 's/^/    /'
  exit 1
fi

# 取权威源（用 git show，不依赖当前检出的是哪个分支）
git -C "$REPO_ROOT" show develop/v2:yan-content/content.v2.json > "$TMP_JSON"
python3 -m json.tool "$TMP_JSON" > /dev/null && echo "→ JSON 校验通过" || { echo "✗ JSON 有错误"; exit 1; }

read -r WORD_COUNT FIELD_COUNT <<EOF
$(python3 - "$TMP_JSON" <<'PY'
import json, sys

content = json.load(open(sys.argv[1]))
words = content.get('wordBank') or []
fields = 0
for word in words:
    raw = word.get('wordField')
    if isinstance(raw, list):
        fields += sum(1 for field in raw if isinstance(field, dict) and field.get('sentence', {}).get('jp'))
    elif isinstance(raw, dict) and raw.get('sentence', {}).get('jp'):
        fields += 1
print(len(words), fields)
PY
)
EOF
echo "→ develop/v2 提交内容：词条 $WORD_COUNT 条，词场 $FIELD_COUNT 条"
if [ "$ASSUME_YES" -eq 1 ]; then
  echo "→ 已使用 --yes，跳过人工确认"
else
  read -r -p "确认发布这份 develop/v2 内容？[y/N] " CONFIRM
  case "$CONFIRM" in
    y|Y|yes|YES) echo "→ 已确认" ;;
    *) echo "✗ 未确认，发布已取消"; exit 1 ;;
  esac
fi

# 和线上比一下规模，避免闭眼发布
git -C "$REPO_ROOT" fetch origin main
if git -C "$REPO_ROOT" cat-file -e origin/main:content.v2.json 2>/dev/null; then
  git -C "$REPO_ROOT" show origin/main:content.v2.json > "$TMP_JSON.old" 2>/dev/null || true
  python3 - "$TMP_JSON.old" "$TMP_JSON" <<'PY' || true
import json, sys
try:
    old = json.load(open(sys.argv[1])); new = json.load(open(sys.argv[2]))
except Exception:
    sys.exit(0)
changed = False
for k in ("mapPlaces", "wordBank", "scenes", "cultureNotes", "culturalFusion"):
    a, b = len(old.get(k) or []), len(new.get(k) or [])
    if a != b:
        changed = True
        print(f"→ {k}: {a} → {b}" + ("   ← 减少，确认是有意的" if b < a else ""))
if not changed:
    print("→ 各区块条数与线上一致（只有内容细节变化）")
PY
  rm -f "$TMP_JSON.old"
fi

# 把 local main 同步到 origin/main，放入新内容并推送
git -C "$REPO_ROOT" checkout -B main origin/main
cp "$TMP_JSON" "$REPO_ROOT/content.v2.json"
git -C "$REPO_ROOT" add content.v2.json

# 隐私政策也发到 main:App Store 要求一个可访问的隐私政策地址,
# 它由 GitHub Pages 从 main 的仓库根目录提供
# (https://ysy929ysy.github.io/yan-content/privacy.html)。
if git -C "$REPO_ROOT" show develop/v2:yan-content/privacy.html > "$REPO_ROOT/privacy.html" 2>/dev/null; then
  git -C "$REPO_ROOT" add privacy.html
  echo "→ 同时发布 privacy.html"
fi
if git -C "$REPO_ROOT" diff --cached --quiet; then
  echo "→ 内容与线上完全一致，无需发布"
  exit 0
fi
git -C "$REPO_ROOT" commit -q -m "content: sync from develop/v2 $(date '+%Y-%m-%d')"
git -C "$REPO_ROOT" push origin main

echo "✓ 推送完成 — 用户下次打开 App 即可同步"
