#!/usr/bin/env node
'use strict';

/**
 * scripts/gemini_call.js
 * Gemini API 呼び出し基盤（Google Search grounding対応）
 *
 * 使い方（CLI）:
 *   node scripts/gemini_call.js "農業補助金2026の最新情報を調べて"
 *   node scripts/gemini_call.js --no-search "この文章を要約して"
 *
 * モジュールとして使う場合:
 *   const { callGemini } = require('./scripts/gemini_call');
 *   const { text } = await callGemini("プロンプト", { useSearch: true });
 */

const fs   = require('fs');
const path = require('path');

// ─── .env 読み込み ─────────────────────────────────────────────────────────────
// 既存スクリプトと同じ ~/.sen-board.env を参照
const ENV_FILE = path.join(process.env.HOME, '.sen-board.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^(?:export\s+)?(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

// APIキーは callGemini() 呼び出し時にチェック（dry-run等でrequireしても落ちないよう）

// ─── 定数 ────────────────────────────────────────────────────────────────────
const ROOT        = path.resolve(__dirname, '..');
const USAGE_FILE  = path.join(ROOT, 'data', 'ai_usage.json');
const LOG_FILE    = path.join(ROOT, 'logs', 'gemini.log');
const DAILY_LIMIT = 100; // 1日の上限呼び出し回数

const DEFAULT_MODEL = 'gemini-2.5-flash';
const API_BASE      = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── コストガード ─────────────────────────────────────────────────────────────
function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveUsage(usage) {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function checkLimit(today, usage) {
  const count = usage[today]?.gemini ?? 0;
  if (count >= DAILY_LIMIT) {
    throw new Error(`[COST GUARD] Gemini 1日上限 ${DAILY_LIMIT}回 に到達（本日: ${count}回）`);
  }
}

function incrementUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = loadUsage();

  if (!usage[today]) usage[today] = { gemini: 0, claude: 0 };
  checkLimit(today, usage);

  usage[today].gemini++;
  saveUsage(usage);
  return { count: usage[today].gemini, today };
}

// ─── ログ記録 ─────────────────────────────────────────────────────────────────
function writeLog(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

// ─── Gemini API 呼び出し ──────────────────────────────────────────────────────
/**
 * @param {string} prompt
 * @param {{ model?: string, useSearch?: boolean, temperature?: number, maxTokens?: number }} opts
 * @returns {{ text: string, sources: string[], raw: object }}
 */
async function callGemini(prompt, opts = {}) {
  const {
    model       = DEFAULT_MODEL,
    useSearch   = true,
    temperature = 0.7,
    maxTokens   = 2000,
  } = opts;

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error('[Gemini] GEMINI_API_KEY が未設定です（~/.sen-board.env に export GEMINI_API_KEY=... を追記）');
  }

  const { count, today } = incrementUsage();

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  // Google Search grounding
  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const url = `${API_BASE}/${model}:generateContent?key=${API_KEY}`;

  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new Error(`[Gemini] ネットワークエラー: ${err.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`[Gemini] API エラー ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? '';

  // grounding メタデータからソースURL抽出
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map(c => c.web?.uri)
    .filter(Boolean);

  writeLog({
    ts:        new Date().toISOString(),
    model,
    useSearch,
    calls_today: count,
    prompt_len:  prompt.length,
    resp_len:    text.length,
  });

  return { text, sources, raw: data };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node scripts/gemini_call.js [--no-search] <prompt>');
    console.log('  --no-search  Google Search grounding を無効化');
    process.exit(0);
  }

  const noSearch = args[0] === '--no-search';
  const prompt   = noSearch ? args.slice(1).join(' ') : args.join(' ');

  if (!prompt.trim()) {
    console.error('[ERROR] プロンプトが空です');
    process.exit(1);
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error('[ERROR] GEMINI_API_KEY が未設定です');
    console.error('  ~/.sen-board.env に以下を追記してください:');
    console.error('  export GEMINI_API_KEY=your_key_here');
    process.exit(1);
  }

  process.stderr.write(`[Gemini] 呼び出し中... (search=${!noSearch})\n`);

  const { text, sources } = await callGemini(prompt, { useSearch: !noSearch });

  console.log(text);

  if (sources.length > 0) {
    console.log('\n--- 参照ソース ---');
    sources.forEach((s, i) => console.log(`${i + 1}. ${s}`));
  }
}

// require() 経由で読み込まれた場合は main() を実行しない
if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { callGemini };
