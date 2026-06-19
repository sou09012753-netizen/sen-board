'use strict';
/**
 * collectors/keiba_collector.js
 * JRA 出走表・オッズ収集スクリプト（土日のみ実行）
 *
 * 実行: node collectors/keiba_collector.js
 * 前提: npm install（collectors/ ディレクトリ内）
 */

const fs   = require('fs');
const path = require('path');

let cheerio;
try {
  cheerio = require('cheerio');
} catch {
  console.error('[FATAL] npm install cheerio が必要です（collectors/ ディレクトリで実行）');
  process.exit(1);
}

// ─── 定数 ───────────────────────────────────────────────────────────────────

const ROOT      = path.resolve(__dirname, '..');
const LOGS_DIR  = path.join(ROOT, 'logs');
const DATA_ROOT = path.join(ROOT, 'data', 'raw');
const JRA_BASE  = 'https://www.jra.go.jp';

const VENUE_MAP = {
  '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
  '05': '東京', '06': '中山', '07': '中京', '08': '京都',
  '09': '阪神', '10': '小倉',
};

// JRAサイトに対してブラウザと区別されないための最低限ヘッダー
const DEFAULT_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
};

// ─── ユーティリティ ─────────────────────────────────────────────────────────

function yyyymmdd(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function isWeekend(date = new Date()) {
  const d = date.getDay();
  return d === 0 || d === 6; // 0=日曜, 6=土曜
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// リクエスト間の 1〜2 秒ランダム待機
function wait() {
  return sleep(1000 + Math.random() * 1000);
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function info(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function logError(context, err) {
  const line = `[${new Date().toISOString()}] ${context}: ${err?.message ?? String(err)}\n`;
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(path.join(LOGS_DIR, 'keiba_error.log'), line);
  process.stderr.write(line);
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: DEFAULT_HEADERS,
    signal:  AbortSignal.timeout(30_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// ─── スケジュール取得 ────────────────────────────────────────────────────────

async function fetchSchedule(date) {
  const url  = `${JRA_BASE}/keiba/today/`;
  const html = await fetchHtml(url);
  const $    = cheerio.load(html);

  const meetings = [];

  // JRAの今日ページは .race_place_box や .lay_kaisai_w で会場ブロックを区切る
  const venueBlocks = $('.race_place_box, .lay_kaisai_w, [class*="kaisai"]');

  if (venueBlocks.length === 0) {
    // フォールバック: 全レースリンクをフラットに収集して会場コードから分類
    return parseFlatSchedule($, date);
  }

  venueBlocks.each((_, block) => {
    const $block    = $(block);
    const headerTxt = $block.find('.place_name, h3, h4, .kaisai_name').first().text().trim();

    const venueName = Object.values(VENUE_MAP).find(v => headerTxt.includes(v)) ?? headerTxt.slice(0, 3);
    const venueCode = Object.keys(VENUE_MAP).find(k => VENUE_MAP[k] === venueName) ?? '00';

    const races = [];
    $block.find('a').each((_, a) => {
      const href = $(a).attr('href') ?? '';
      // シャットバヒョウリンクを対象。詳細/オッズリンクは除外
      if (!href.includes('shutsubahyo') && !href.match(/\/\d{2}\/\d{2}\//)) return;

      const text     = $(a).text().trim();
      const raceNum  = parseInt(text.match(/^(\d{1,2})/)?.[1] ?? '', 10);
      if (!raceNum || raceNum < 1 || raceNum > 12) return;

      races.push({
        raceNum,
        url: href.startsWith('http') ? href : `${JRA_BASE}${href}`,
      });
    });

    if (races.length > 0) {
      meetings.push({ venueName, venueCode, races });
    }
  });

  return meetings;
}

// JRA新サイト構造用フォールバック: /YYYYMMDD/VV/RR/ パターンのリンクを収集
function parseFlatSchedule($, date) {
  const racesByVenue = {};

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    // /keiba/today/YYYYMMDD/VV/RR/ または /JRADB/... の2系統に対応
    const m = href.match(/\/(\d{8})\/(\d{2})\/(\d{2})\//);
    if (!m) return;

    const [, hDate, venueCode, raceNumStr] = m;
    if (hDate !== date) return;

    const raceNum   = parseInt(raceNumStr, 10);
    const venueName = VENUE_MAP[venueCode] ?? `会場${venueCode}`;
    const url       = href.startsWith('http') ? href : `${JRA_BASE}${href}`;

    if (!racesByVenue[venueCode]) {
      racesByVenue[venueCode] = { venueName, venueCode, races: [] };
    }

    if (!racesByVenue[venueCode].races.find(r => r.raceNum === raceNum)) {
      racesByVenue[venueCode].races.push({ raceNum, url });
    }
  });

  return Object.values(racesByVenue).map(v => ({
    ...v,
    races: v.races.sort((a, b) => a.raceNum - b.raceNum),
  }));
}

// ─── レース基本情報パース ────────────────────────────────────────────────────

function parseRaceInfo($) {
  // 複数セレクタを試みて最初にヒットしたものを使う（JRAサイト改修対応）
  const textOf = (...selectors) => {
    for (const sel of selectors) {
      const t = $(sel).first().text().trim();
      if (t) return t;
    }
    return '';
  };

  const raceName = textOf('h1.race_name', '.race_name', 'h1', 'h2');

  // "芝1600m（右・内）良" のような形式からパース
  const courseRaw = textOf('.race_data1', '.race_detail', '.course_info', '.data');
  const distM     = courseRaw.match(/(\d{3,4})m/);
  const surface   = courseRaw.includes('芝') ? '芝'
    : (courseRaw.includes('ダ') ? 'ダート' : '');
  const direction = courseRaw.includes('右') ? '右'
    : (courseRaw.includes('左') ? '左' : '');

  const condRaw = textOf('.race_data2', '.baba_info', '.race_condition', courseRaw);
  const trackCondition =
    condRaw.includes('不良') ? '不良'
    : condRaw.includes('重')  ? '重'
    : condRaw.includes('稍')  ? '稍重'
    : condRaw.includes('良')  ? '良'
    : '未発表';

  const weather = ['晴', '曇', '雨', '小雨', '雪', '小雪'].find(w => condRaw.includes(w)) ?? '';

  const grade = ['GI', 'GII', 'GIII', 'G1', 'G2', 'G3', 'OP', '3勝', '2勝', '1勝', '新馬', '未勝利']
    .find(g => raceName.includes(g) || courseRaw.includes(g)) ?? '';

  return {
    raceName,
    distance:       distM ? parseInt(distM[1], 10) : null,
    surface,
    direction,
    trackCondition,
    weather,
    grade,
  };
}

// ─── 出走表パース ────────────────────────────────────────────────────────────

function parseShutsubahyo($) {
  const horses = [];

  // JRAの出走表は .race_table_01 または table.shutsubahyo 等
  const $table = $('table.race_table_01, table.shutsubahyo, table[summary*="出走"], table').first();
  if (!$table.length) return horses;

  $table.find('tr').each((_, row) => {
    const $tds = $(row).find('td');
    if ($tds.length < 6) return;

    // JRA出走表の列順: 枠番 | 馬番 | 印 | 馬名 | 性齢 | 斤量 | 騎手 | 調教師 | 馬主 | 直近5走 | ...
    const cells = $tds.toArray().map(td => $(td).text().trim());

    const frameNum = parseInt(cells[0], 10);
    const horseNum = parseInt(cells[1], 10);
    if (!horseNum || horseNum < 1 || horseNum > 18) return;

    // 馬名セル（印列がある場合に列ズレを考慮）
    const horseNameCell = $tds.filter((_, td) => {
      const cls = ($(td).attr('class') ?? '') + ($(td).find('a').attr('href') ?? '');
      return cls.includes('horse') || cls.includes('uma') || $(td).find('a[href*="horse"]').length > 0;
    }).first();
    const horseName = horseNameCell.length
      ? horseNameCell.text().trim()
      : cells[3] ?? '';

    // 性齢: "牡3" "牝4" "せん5" のような形式
    const sexAge    = cells.find(c => /^[牡牝せセ]\d/.test(c)) ?? '';
    const sex       = sexAge.slice(0, 1);
    const age       = parseInt(sexAge.slice(1), 10) || null;

    // 斤量: 2桁小数
    const weightStr = cells.find(c => /^\d{2}\.\d$/.test(c)) ?? '';
    const weight    = weightStr ? parseFloat(weightStr) : null;

    // 騎手: 姓のみまたはフルネーム。文字数で騎手らしい列を推定
    const jockey  = cells[6] ?? '';
    const trainer = cells[7] ?? '';
    const owner   = cells[8] ?? '';

    // 直近5走: "1着 2着 ..." や "1-2-3-4-5" のような形式
    const recentRaw  = cells.slice(9).join(' ');
    const recentNums = recentRaw.match(/\d{1,2}/g)?.slice(0, 5).map(Number) ?? [];

    horses.push({
      frameNum:      isNaN(frameNum) ? null : frameNum,
      horseNum,
      horseName,
      sex,
      age,
      weight,
      jockey,
      trainer,
      owner,
      recentResults: recentNums, // 直近5走 着順
      winOdds:       null,       // 後でオッズページから補完
    });
  });

  return horses;
}

// ─── 単勝オッズ取得 ──────────────────────────────────────────────────────────

async function fetchOdds(entryUrl) {
  // 出走表URLからオッズページのURLを生成（JRAは shutsubahyo → odds のパス変換）
  const oddsUrl = entryUrl
    .replace('/shutsubahyo', '/odds')
    .replace('shutsubahyo.html', 'odds.html');

  let html;
  try {
    html = await fetchHtml(oddsUrl);
  } catch (err) {
    // オッズが同一ページに埋め込まれている場合もあるので無視して続行
    logError(`オッズページ取得失敗 ${oddsUrl}`, err);
    return {};
  }

  const $    = cheerio.load(html);
  const odds = {};

  // 単勝オッズテーブル: 馬番列と倍率列のペア
  $('table.odds_tan, table[summary*="単勝"], table').each((_, tbl) => {
    const $tbl = $(tbl);
    if (!$tbl.text().includes('単勝') && !$tbl.text().includes('倍')) return;

    $tbl.find('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const numStr  = cells.eq(0).text().trim();
      const oddsStr = cells.eq(cells.length - 1).text().replace(/[^\d.]/g, '');
      const num     = parseInt(numStr, 10);
      const val     = parseFloat(oddsStr);

      if (num >= 1 && num <= 18 && !isNaN(val) && val > 0) {
        odds[num] = val;
      }
    });

    if (Object.keys(odds).length > 0) return false; // 最初にヒットしたテーブルで終了
  });

  return odds;
}

// ─── JSON 保存 ───────────────────────────────────────────────────────────────

function saveJson(date, venueName, raceNum, data) {
  const dir  = path.join(DATA_ROOT, date, 'keiba');
  const file = path.join(dir, `${date}_${venueName}_R${String(raceNum).padStart(2, '0')}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return file;
}

// ─── メイン ─────────────────────────────────────────────────────────────────

async function main() {
  const date = yyyymmdd();

  if (!isWeekend()) {
    info(`平日のためスキップ（${date}）`);
    process.exit(0);
  }

  info(`=== JRA 出走表収集 開始 ${date} ===`);

  let schedule;
  try {
    schedule = await fetchSchedule(date);
    await wait();
  } catch (err) {
    logError('スケジュール取得失敗', err);
    process.exit(1);
  }

  if (schedule.length === 0) {
    info('本日の開催なし（またはスケジュール取得失敗）');
    process.exit(0);
  }

  info(`開催: ${schedule.map(m => `${m.venueName}(${m.races.length}R)`).join(', ')}`);

  let saved = 0;
  let errors = 0;

  for (const meeting of schedule) {
    for (const race of meeting.races) {
      await wait();

      try {
        const html     = await fetchHtml(race.url);
        const $        = cheerio.load(html);
        const raceInfo = parseRaceInfo($);
        const horses   = parseShutsubahyo($);

        await wait();
        const odds = await fetchOdds(race.url);

        horses.forEach(h => { h.winOdds = odds[h.horseNum] ?? null; });

        const payload = {
          collectedAt:    new Date().toISOString(),
          date,
          venue:          meeting.venueName,
          venueCode:      meeting.venueCode,
          raceNum:        race.raceNum,
          sourceUrl:      race.url,
          ...raceInfo,
          horses,
        };

        const file = saveJson(date, meeting.venueName, race.raceNum, payload);
        info(`✓ ${meeting.venueName} R${race.raceNum} — ${horses.length}頭 → ${path.basename(file)}`);
        saved++;

      } catch (err) {
        logError(`${meeting.venueName} R${race.raceNum}`, err);
        errors++;
        // エラーは記録して次のレースへ続行
      }
    }
  }

  info(`=== 完了: ${saved}レース保存 / ${errors}エラー ===`);
}

main().catch(err => {
  logError('予期しないエラー（main）', err);
  process.exit(1);
});
