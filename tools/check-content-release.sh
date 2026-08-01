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
echo "【1/5】Schema 校验..."
if python3 tools/validate-schema.py > reports/schema-validation-report.md 2>&1; then
  SCHEMA_OK=1
  echo "  ✓ Schema 校验通过"
else
  SCHEMA_OK=0
  echo "  ✗ Schema 校验失败（详见 reports/schema-validation-report.md）"
fi
echo "  → reports/schema-validation-report.md"

echo ""
echo "【2/5】Fallback 同步检查..."
if diff -q yan-content/content.v2.json YanApp/assets/content.fallback.json > /dev/null 2>&1; then
  FALLBACK_OK=1
  echo "  ✓ fallback.json 同步"
else
  FALLBACK_OK=0
  echo "  ✗ fallback.json 与 content.v2.json 不一致"
  echo "    修复：cp yan-content/content.v2.json YanApp/assets/content.fallback.json"
fi

echo ""
echo "【3/5】运行 wordBank 审计..."
python3 tools/audit-wordbank-examples.py > reports/wordbank-audit-report.md
echo "  → reports/wordbank-audit-report.md"

echo ""
echo "【4/5】打卡点内容审计..."
if python3 tools/check-places.py > reports/places-report.md 2>&1; then
  PLACES_OK=1
  echo "  ✓ 打卡点内容通过"
else
  PLACES_OK=0
  echo "  ✗ 打卡点内容有 Blocker（详见 reports/places-report.md）"
fi
echo "  → reports/places-report.md"

echo ""
echo "【5/5】运行 exampleRoma 候选报告..."
python3 tools/generate-example-roma.py > reports/example-roma-report.md
echo "  → reports/example-roma-report.md"

# ── Blocker 判定 ──────────────────────────────────────────────
BLOCKER_ISSUES=(
  missing_exampleJp
  missing_exampleZh
  missing_exampleRoma
  exampleRoma_has_japanese
)
# target_word_not_found_by_sudachi / exampleJp_long / exampleZh_maybe_gloss 不是 Blocker，只计入 Polish

BLOCKER_COUNT=0
BLOCKER_DETAIL=()

# Schema
if [ "$SCHEMA_OK" -eq 0 ]; then
  BLOCKER_COUNT=$((BLOCKER_COUNT + 1))
  BLOCKER_DETAIL+=("Schema 校验失败")
fi

# 打卡点内容
if [ "${PLACES_OK:-1}" -eq 0 ]; then
  BLOCKER_COUNT=$((BLOCKER_COUNT + 1))
  BLOCKER_DETAIL+=("打卡点内容有 Blocker")
fi

# Fallback sync
if [ "$FALLBACK_OK" -eq 0 ]; then
  BLOCKER_COUNT=$((BLOCKER_COUNT + 1))
  BLOCKER_DETAIL+=("fallback.json 不同步")
fi

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
  echo "  reports/schema-validation-report.md"
  echo "  reports/wordbank-audit-report.md"
  echo "  reports/example-roma-report.md"
else
  echo "  ✗ 有 Blocker，请修复后重新运行"
  echo ""
  echo "详细报告："
  echo "  reports/schema-validation-report.md"
  echo "  reports/wordbank-audit-report.md"
  exit 1
fi
