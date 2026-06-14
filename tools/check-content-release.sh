#!/bin/bash
# 内容发布前审计入口
# 用法：bash tools/check-content-release.sh
# Blocker 为 0 才可执行 bash scripts/push-content.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ 工作目录：$REPO_ROOT"
mkdir -p reports

echo ""
echo "【1/2】运行 wordBank 审计..."
python3 tools/audit-wordbank-examples.py > reports/wordbank-audit-report.md
echo "  → reports/wordbank-audit-report.md"

echo ""
echo "【2/2】运行 exampleRoma 候选报告..."
python3 tools/generate-example-roma.py > reports/example-roma-report.md
echo "  → reports/example-roma-report.md"

# ── Blocker 判定 ──────────────────────────────────────────────
# 以下 issue 类型视为 Blocker（对应用户定义的 7 条 Blocker 规则）
BLOCKER_ISSUES=(
  missing_exampleJp
  missing_exampleZh
  missing_exampleRoma
  exampleRoma_has_japanese
  target_word_not_found_by_sudachi
)
# exampleJp_long / exampleZh_maybe_gloss 不是 Blocker，只计入 Polish

BLOCKER_COUNT=0
BLOCKER_DETAIL=()

# wordBank 条数
if grep -q "count check: FAIL" reports/wordbank-audit-report.md; then
  BLOCKER_COUNT=$((BLOCKER_COUNT + 1))
  BLOCKER_DETAIL+=("wordBank 条数不符")
fi

for issue in "${BLOCKER_ISSUES[@]}"; do
  line=$(grep -E "^- ${issue}: [0-9]+" reports/wordbank-audit-report.md || true)
  if [ -n "$line" ]; then
    n=$(echo "$line" | grep -o '[0-9]*' | tail -1)
    BLOCKER_COUNT=$((BLOCKER_COUNT + n))
    BLOCKER_DETAIL+=("$issue: $n")
  fi
done

# ── 输出结果 ──────────────────────────────────────────────────
echo ""
echo "════════════════════════════════"
echo "  审计结果"
echo "════════════════════════════════"
echo "  Blocker 数：$BLOCKER_COUNT"

if [ ${#BLOCKER_DETAIL[@]} -gt 0 ]; then
  for detail in "${BLOCKER_DETAIL[@]}"; do
    echo "  ✗ $detail"
  done
fi

echo ""

if [ "$BLOCKER_COUNT" -eq 0 ]; then
  echo "  ✓ 无 Blocker"
  echo ""
  echo "下一步："
  echo "  bash scripts/push-content.sh"
  echo ""
  echo "详细报告："
  echo "  reports/wordbank-audit-report.md"
  echo "  reports/example-roma-report.md"
else
  echo "  ✗ 有 Blocker，请修复后重新运行"
  echo ""
  echo "详细报告：reports/wordbank-audit-report.md"
  exit 1
fi
