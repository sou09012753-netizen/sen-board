#!/bin/bash
export PATH="/Users/sou/.nvm/versions/node/v24.16.0/bin:$PATH"

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
OUTPUT="$HOME/sen-board/logs/${MONTH}/${DATE}_EC戦略.md"
AGENTS=$(find "$HOME/sen-board/agents" -name "*.md" | xargs cat 2>/dev/null)

echo "# 産直EC 戦略・契約・法務 総点検 — ${DATE}" > "$OUTPUT"
echo "" >> "$OUTPUT"

BASE="あなたはSEN社の経営会議AIチーム。以下のコンテキストを踏まえて深く分析せよ。

【会社コンテキスト】
${AGENTS}

【EC事業の前提】
- リール(SNS)→ECサイト→購入の導線。商品はリールで「これ買いたい」と思わせて棚から選ばせる
- 在庫を持たない。注文が来たら農家が直接発送(産直ドロップシッピング)
- 撮影は7月頭。それまでにEC・SNS・運用を立ち上げる
- 戦略：JAや市場出荷より農家が稼げる構造にする。高単価・まとめ売り・質で勝負・想いを届ける。安売りはしない
- 法務は専門家確認が前提。AIは論点洗い出しと素案までに留める

甘い分析は禁止。否定AIに徹底的に穴を叩かせ、統合AIが対策まで出す。数字は調査して根拠を示す。"

SCRIPTS="$HOME/sen-board/scripts"

ask_ai() {
  local agent="$1"
  local type="$2"
  local prompt="$3"
  local flags=""
  [ -n "$agent" ] && flags="--agent $agent"
  [ -n "$type"  ] && flags="$flags --type $type"
  node "$SCRIPTS/ask.js" $flags <<< "$prompt"
}

# $1: セクションタイトル  $2: 論点  $3: agent（省略可）  $4: type（省略可）
run() {
  echo "" >> "$OUTPUT"
  echo "---" >> "$OUTPUT"
  echo "## $1" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  ask_ai "${3:-}" "${4:-}" "$BASE

【今回の論点】
$2" >> "$OUTPUT"
  echo "[$(date +%H:%M)] $1 完了"
}

run "1. 農家を口説くロジック" "JAや市場出荷だと農家の手取りは販売価格の何割か調査せよ。その上で、このECなら手取りがどう変わるかを数字で示し、農家を口説くトーク・根拠・比較表を作れ。" "農業" "research"
run "2. 高単価・まとめ売り設計" "安売りしないための具体策。高単価・まとめ売り・質で勝負・想いを届ける設計。価格帯の目安、セット商品の組み方、想いの乗せ方を具体的に。" "農業" "decision"
run "3. 実行設計の穴（否定AI）" "リール→EC→農家直送の実行で詰まる穴を全て洗い出せ。発送・送料負担・農家のキャパ・注文集中・クレーム対応・品質保証・取り分・購入導線の離脱。各穴に統合AIが対策を出す。" "農業" "decision"
run "4. 農家との契約論点" "農家と交わす契約で詰めるべき論点。委託形態・取り分割合・発送責任・品質保証・クレーム時の責任分界・解約条件・専属性。論点ごとに推奨案を示せ。" "法務"
run "5. 法務チェックリスト" "特定商取引法・食品表示法・景品表示法・その他関連法規で、このEC事業が確認すべき項目を全てリスト化。各項目で専門家(行政書士/弁護士)に確認すべき点を明記。" "法務"
run "6. 契約書の素案" "農家との委託契約書の素案を作れ。冒頭に『これは叩き台であり、締結前に必ず専門家の確認が必要』と明記。実務で使う条項構成で。" "法務"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "生成完了：$(date)" >> "$OUTPUT"
echo "✅ 全6本完了：$OUTPUT"

cd $HOME/sen-board && git add . && git commit -m "auto: $(date +%Y-%m-%d) EC戦略リサーチ" && git push origin main
