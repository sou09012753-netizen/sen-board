#!/bin/bash
export PATH="/Users/sou/.nvm/versions/node/v24.16.0/bin:$PATH"
DATE=$(date +%Y-%m-%d)
OUTPUT="$HOME/sen-board/logs/${DATE}.md"
CONTEXT=$(find "$HOME/sen-board/agents" -name "*.md" | xargs cat 2>/dev/null)

echo "# SEN 夜間リサーチ — ${DATE}" > "$OUTPUT"
echo "" >> "$OUTPUT"

BASE="あなたはSEN社の経営会議AIチームです。以下のコンテキストを踏まえて深く分析せよ。甘い分析は禁止。否定AIに穴を叩かせ、統合AIが対策まで出す。

【会社コンテキスト】
${CONTEXT}

【前提】
- ランウェイ1.4ヶ月・借金290万・今月のコーチング成約が全ての前提
- スケ：今月営業+コーチング、来月からコーチング専任
- 農業EC：さとな・なのかがインターン主導で進行中（仙石は関与しない）
- SENアプリ：Vercel稼働中・クライアント検証フェーズ
- EC事業：産直ドロップシッピング設計中・7月頭撮影ゴール"

run() {
  echo "" >> "$OUTPUT"
  echo "---" >> "$OUTPUT"
  echo "## $1" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  claude --print "$BASE

【今回の論点】
$2" >> "$OUTPUT"
  echo "[$(date +%H:%M)] $1 完了"
}

run "1. SENアプリ" "現在の完成度と次に実装すべき機能の優先順位。りくくん・さとな・まえはらのフィードバック取得状況。SESSION 0実装の是非。今週の一手。"

run "2. EC戦略" "産直ドロップシッピングECの進捗確認。さとなのテンプレート記入状況。農家を口説くロジックの精度。7月撮影までの残タスク。今週の一手。"

run "3. スケの営業進捗" "今月10件目標に対するパイプライン状況。2回目クロージング対象の状況。DM数・商談数の進捗。詰まってる箇所と対策。今週の一手。"

run "4. チーム状況" "さとな・なのか・スケそれぞれの動き・リスク・次の関与タイミング。仙石が今週やるべき承認・判断はあるか。チームへの一手。"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "生成完了：$(date)" >> "$OUTPUT"

cd "$HOME/sen-board" && git add . && git commit -m "auto: ${DATE} 夜間リサーチ" && git push origin main
echo "✅ 完了・GitHub push済み：$OUTPUT"
