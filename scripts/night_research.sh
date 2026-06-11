#!/bin/bash
DATE=$(date +%Y-%m-%d)
OUTPUT="$HOME/sen-board/logs/${DATE}.md"
AGENTS_DIR="$HOME/sen-board/agents"

echo "# SEN 夜間リサーチ — ${DATE}" > $OUTPUT
echo "" >> $OUTPUT

CONTEXT=$(find $AGENTS_DIR -name "*.md" | xargs cat 2>/dev/null)

claude --print "
あなたはSEN社の経営会議AIチームです。以下の4テーマを順番に分析してください。

【会社コンテキスト — agents フォルダより】
${CONTEXT}

【分析の4テーマ】
1. コーチング事業（79万商品・ターゲット再定義・差別化）
2. 農業EC（10億ゴール・インターン主導・差別化戦略）
3. SENアプリ完成度（自己分析コーチングSaaS・競合比較・次の一手）
4. note自動化（X→note収益パイプライン・期待値・実装優先度）

【各テーマで出すこと】
- 世界水準の専門家視点でのリサーチ（競合・市場・トレンド）
- 差別化ポイント（なぜSENが勝てるか）
- 期待値（3ヶ月・1年・3年の数値感）
- 今週やるべき一手

【AIロール設定】
- コーチング分析：Marshall Goldsmith × ICFマスターコーチ
- 農業EC分析：孫正義 × Amazonアグリ戦略部門
- アプリ分析：Paul Graham × Steve Jobs
- note自動化：Gary Vaynerchuk × SEO神田昌典
" >> $OUTPUT

echo "" >> $OUTPUT
echo "---" >> $OUTPUT
echo "生成時刻：$(date)" >> $OUTPUT
echo "完了：$OUTPUT"
