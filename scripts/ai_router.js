#!/usr/bin/env node
'use strict';

/**
 * scripts/ai_router.js
 * Claude / Gemini 自動振り分けルーター
 *
 * 使い方（CLI）:
 *   node scripts/ai_router.js "農業補助金の最新情報を調べて"
 *   node scripts/ai_router.js --agent 法務 "この契約書のリスクを分析して"
 *   node scripts/ai_router.js --type search "ECの競合比較"
 *   node scripts/ai_router.js --dry-run "このタスクはどちらに振られる？"
 *
 * モジュールとして使う場合:
 *   const { route } = require('./scripts/ai_router');
 *   const { text, engine } = await route("プロンプト", { agent: "農業" });
 */

const fs   = require('fs');
const path = require('path');

// .env 読み込み（gemini_call.js と同じ処理）
const ENV_FILE = path.join(process.env.HOME, '.sen-board.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^(?:export\s+)?(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const { callGemini } = require('./gemini_call');

// ─── ルーティング定義 ─────────────────────────────────────────────────────────

// Gemini に向けるエージェント（検索・情報収集が主な役割）
const GEMINI_AGENTS = ['農業', 'マーケティング'];

// Claude に向けるエージェント（慎重な判断・コーディングが必要）
const CLAUDE_AGENTS = ['法務', '財務', 'プロダクト', '全体管理', '営業', '人材'];

// 営業は内容依存なのでキーワード判定に委ねる

// Gemini 寄りキーワード（検索・情報収集系）
const GEMINI_KEYWORDS = [
  '検索', '調べ', '最新', '情報収集', 'リサーチ', 'ニュース',
  'トレンド', '相場', '補助金', '事例', '比較', '動向', '市場',
  '価格', '競合', '口コミ', '評判', 'まとめ', '一覧',
];

// Claude 寄りキーワード（意思決定・コーディング・法務系）
const CLAUDE_KEYWORDS = [
  'コード', 'コーディング', '実装', 'デバッグ', 'バグ', '設計',
  '契約', '法律', '法務', '規約', 'リスク', '判断', '意思決定',
  '戦略', '分析', 'レビュー', '評価', '方針', '交渉',
];

// ─── 判定ロジック ─────────────────────────────────────────────────────────────

/**
 * @param {string} prompt
 * @param {{ agent?: string, taskType?: 'search'|'research'|'code'|'legal'|'decision'|'auto' }} opts
 * @returns {{ engine: 'claude'|'gemini', reason: string }}
 */
function detect(prompt, opts = {}) {
  const { agent = '', taskType = 'auto' } = opts;

  // 1. taskType 明示指定は最優先
  if (taskType === 'search' || taskType === 'research') {
    return { engine: 'gemini', reason: `taskType=${taskType} で明示指定` };
  }
  if (taskType === 'code' || taskType === 'legal' || taskType === 'decision') {
    return { engine: 'claude', reason: `taskType=${taskType} で明示指定` };
  }

  // 2. エージェント名で判定
  if (agent) {
    if (GEMINI_AGENTS.some(a => agent.includes(a))) {
      return { engine: 'gemini', reason: `agent=${agent} は検索・情報収集担当` };
    }
    if (CLAUDE_AGENTS.some(a => agent.includes(a))) {
      return { engine: 'claude', reason: `agent=${agent} は慎重な判断が必要` };
    }
  }

  // 3. キーワードスコアリング
  const geminiScore = GEMINI_KEYWORDS.filter(k => prompt.includes(k)).length;
  const claudeScore = CLAUDE_KEYWORDS.filter(k => prompt.includes(k)).length;

  const matchedGemini = GEMINI_KEYWORDS.filter(k => prompt.includes(k));
  const matchedClaude = CLAUDE_KEYWORDS.filter(k => prompt.includes(k));

  if (geminiScore > claudeScore) {
    return {
      engine: 'gemini',
      reason: `検索系キーワード検出: [${matchedGemini.join(', ')}]`,
    };
  }
  if (claudeScore > geminiScore) {
    return {
      engine: 'claude',
      reason: `判断系キーワード検出: [${matchedClaude.join(', ')}]`,
    };
  }

  // 4. デフォルト: Claude（安全側）
  return { engine: 'claude', reason: 'デフォルト（判定基準なし → 安全側のClaudeへ）' };
}

// ─── Claude 呼び出し ──────────────────────────────────────────────────────────

const USAGE_FILE = path.join(__dirname, '..', 'data', 'ai_usage.json');
const LOG_FILE   = path.join(__dirname, '..', 'logs', 'ai_router.log');
const CLAUDE_DAILY_LIMIT = 200;

function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveUsage(u) {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2));
}

function incrementClaude() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = loadUsage();
  if (!usage[today]) usage[today] = { gemini: 0, claude: 0 };

  if (usage[today].claude >= CLAUDE_DAILY_LIMIT) {
    throw new Error(`[COST GUARD] Claude 1日上限 ${CLAUDE_DAILY_LIMIT}回 に到達`);
  }

  usage[today].claude++;
  saveUsage(usage);
  return { count: usage[today].claude, today };
}

async function callClaude(prompt, opts = {}) {
  const {
    model     = 'claude-sonnet-4-6',
    maxTokens = 2000,
  } = opts;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('[Claude] ANTHROPIC_API_KEY が未設定です');

  const { count } = incrementClaude();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[Claude] API エラー ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({
    ts: new Date().toISOString(), engine: 'claude', model,
    calls_today: count, prompt_len: prompt.length, resp_len: text.length,
  }) + '\n');

  return { text };
}

// ─── メインルーター ───────────────────────────────────────────────────────────

/**
 * @param {string} prompt
 * @param {{
 *   agent?:    string,
 *   taskType?: 'search'|'research'|'code'|'legal'|'decision'|'auto',
 *   dryRun?:   boolean,
 *   claudeOpts?: object,
 *   geminiOpts?: object,
 * }} opts
 * @returns {{ text: string, engine: 'claude'|'gemini', reason: string, sources?: string[] }}
 */
async function route(prompt, opts = {}) {
  const { agent, taskType, dryRun = false, claudeOpts = {}, geminiOpts = {} } = opts;
  const { engine, reason } = detect(prompt, { agent, taskType });

  if (dryRun) {
    return { text: '', engine, reason, sources: [] };
  }

  if (engine === 'gemini') {
    const { text, sources } = await callGemini(prompt, { useSearch: true, ...geminiOpts });
    return { text, engine, reason, sources };
  } else {
    const { text } = await callClaude(prompt, claudeOpts);
    return { text, engine, reason, sources: [] };
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = [...process.argv.slice(2)];

  let agent    = '';
  let taskType = 'auto';
  let dryRun   = false;

  // フラグ解析
  while (args.length && args[0].startsWith('--')) {
    const flag = args.shift();
    if (flag === '--agent'   && args.length) agent    = args.shift();
    if (flag === '--type'    && args.length) taskType = args.shift();
    if (flag === '--dry-run')                dryRun   = true;
    if (flag === '--help') {
      console.log([
        'Usage: node scripts/ai_router.js [options] <prompt>',
        '  --agent <name>   エージェント名（農業/マーケティング/法務/財務/プロダクト等）',
        '  --type  <type>   タスク種別を明示（search/research/code/legal/decision）',
        '  --dry-run        実際に呼び出さず、振り分け先と理由だけ表示',
      ].join('\n'));
      process.exit(0);
    }
  }

  const prompt = args.join(' ').trim();
  if (!prompt) {
    console.error('[ERROR] プロンプトを指定してください');
    process.exit(1);
  }

  const { engine, reason } = detect(prompt, { agent, taskType });
  process.stderr.write(`[Router] → ${engine.toUpperCase()}  理由: ${reason}\n`);

  if (dryRun) {
    console.log(`振り分け先: ${engine}\n理由: ${reason}`);
    return;
  }

  const result = await route(prompt, { agent, taskType });
  console.log(result.text);

  if (result.sources?.length > 0) {
    console.log('\n--- 参照ソース ---');
    result.sources.forEach((s, i) => console.log(`${i + 1}. ${s}`));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { route, detect };
