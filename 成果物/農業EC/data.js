/* ════════════════════════════════════════════════
   FARMER & PRODUCT DATA
   農家を追加 = この配列にオブジェクトを1つ足すだけ。
   ナビ・セクション・マップ・カート全てに自動反映される。
   ════════════════════════════════════════════════ */
var FARMERS = [
  {
    id: 'solato',
    name: 'solato',
    nameEn: 'Solato Farm',
    region: '兵庫県伊丹市',
    lat: 34.7848, lng: 135.4231,
    catchphrase: '農業を、未来の憧れに。',
    tagline: '子どもたちの未来に農業という選択肢を残す農園。',
    story: '私たちは作物を売るためだけに農業をしていません。「農業って面白い」「こんな生き方もあるんだ」と感じてもらうきっかけを届けたいと思っています。伊丹でもこんなに美味しい作物が育つことを知ってもらい、子どもたちの未来に農業という選択肢を残したい。その想いを、私たちの作物と一緒に届けます。',
    method: '毎年変わる気候や環境を記録し、植物の変化を数字で追い続けながら栽培しています。感覚だけに頼らず、予測と検証を繰り返すことで品質を高めています。手間と時間をかけて育てた作物だからこその価格です。',
    heroPhoto: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=1200&q=85&auto=format&fit=crop',
    cultivationData: {
      '栽培地域': '兵庫県伊丹市',
      '栽培方法': 'データ記録型・特別栽培',
      '記録年数': '5年',
      '年間データ': '約3,650件',
      '土壌pH': '6.0〜6.5（弱酸性）',
    },
    voice: {
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=85&auto=format&fit=crop',
      headline: 'データと向き合い、伊丹の大地で育てる',
      name: '島﨑 聖菜 さん',
    },
    products: [
      {
        id: 'corn-solato',
        name: '伊丹育ちの朝採れとうもろこしセット',
        shortName: '朝採れとうもろこし',
        season: '夏', price: 2980, unit: '5本セット', stock: 'limited', tag: '数量限定',
        photo: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=800&q=85&auto=format&fit=crop',
        desc: '朝採れ直後の甘みが詰まった5本セット。毎日の気候データを記録しながら丁寧に育てた、伊丹の大地が育む一本。',
        delivery: '常温便 · 収穫後2日以内出荷', shipping: '送料一律660円（税込）',
      },
      {
        id: 'strawberry-solato',
        name: 'そらといちご',
        shortName: 'そらといちご',
        season: '春', price: 3480, unit: '4パックセット', stock: 'in_stock', tag: 'ギフト可',
        photo: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=800&q=85&auto=format&fit=crop',
        desc: '気候データと向き合いながら育てた伊丹の苺。甘みと酸味のバランスを追求した4パックセット。贈答用としても。',
        delivery: '冷蔵便 · 収穫後翌日出荷', shipping: '送料一律880円（税込）',
      },
    ],
  },
];

// 商品をフラット化（カート用）
var PRODUCTS = {};
FARMERS.forEach(f => (f.products || []).forEach(p => { PRODUCTS[p.id] = { ...p, farmerId: f.id }; }));
