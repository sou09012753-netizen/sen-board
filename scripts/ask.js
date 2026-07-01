#!/usr/bin/env node
'use strict';
/**
 * scripts/ask.js
 * シェルスクリプト → ai_router.js の橋渡しCLI
 * stdin からプロンプトを受け取り Claude/Gemini へルーティングして stdout に出力
 *
 * Usage（シェルから）:
 *   ask_ai "$agent" "$type" "$prompt"  →  node scripts/ask.js --agent $agent --type $type <<< "$prompt"
 *
 * 単体テスト:
 *   echo "農業補助金を調べて" | node scripts/ask.js --agent 農業 --type research --dry-run
 */

const { route, detect } = require('./ai_router');

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', c => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const args = [...process.argv.slice(2)];
  let agent   = '';
  let taskType = 'auto';
  let dryRun   = false;

  while (args.length && args[0].startsWith('--')) {
    const flag = args.shift();
    if (flag === '--agent'   && args.length) agent    = args.shift();
    if (flag === '--type'    && args.length) taskType = args.shift();
    if (flag === '--dry-run')                dryRun   = true;
  }

  // 残りの引数 or stdin からプロンプト取得
  const prompt = args.length > 0
    ? args.join(' ')
    : await readStdin();

  if (!prompt.trim()) {
    process.stderr.write('[ask] プロンプトが空です\n');
    process.exit(1);
  }

  if (dryRun) {
    const { engine, reason } = detect(prompt, { agent, taskType });
    process.stdout.write(`[DRY-RUN] → ${engine.toUpperCase()}\n理由: ${reason}\n`);
    return;
  }

  const { text, engine, reason, sources } = await route(prompt, { agent, taskType });
  process.stderr.write(`[${engine.toUpperCase()}] ${reason}\n`);

  process.stdout.write(text + '\n');

  if (sources?.length > 0) {
    process.stdout.write('\n--- 参照ソース ---\n');
    sources.forEach((s, i) => process.stdout.write(`${i + 1}. ${s}\n`));
  }
}

main().catch(err => {
  process.stderr.write(err.message + '\n');
  process.exit(1);
});
