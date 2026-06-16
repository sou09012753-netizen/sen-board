#!/bin/bash
export PATH="/Users/sou/.nvm/versions/node/v24.16.0/bin:$PATH"

# APIキー読み込み
if [ -f "$HOME/.sen-board.env" ]; then
  source "$HOME/.sen-board.env"
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[ERROR] ANTHROPIC_API_KEY が未設定です" >&2
  exit 1
fi

DATE=$(date +%Y-%m-%d)
MONTH=$(date +%Y-%m)
mkdir -p "$HOME/sen-board/logs/${MONTH}"
OUTPUT="$HOME/sen-board/logs/${MONTH}/${DATE}_夜間リサーチ.md"
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

ask_claude() {
  local prompt="$1"
  local body
  body=$(python3 -c "
import json, sys
prompt = sys.stdin.read()
print(json.dumps({
  'model': 'claude-opus-4-8',
  'max_tokens': 2000,
  'messages': [{'role': 'user', 'content': prompt}]
}))
" <<< "$prompt")

  curl -s https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$body" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['content'][0]['text'] if 'content' in d else d.get('error',{}).get('message','APIエラー'))"
}

run() {
  echo "" >> "$OUTPUT"
  echo "---" >> "$OUTPUT"
  echo "## $1" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  ask_claude "$BASE

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
COACHING SEN

管理画面

