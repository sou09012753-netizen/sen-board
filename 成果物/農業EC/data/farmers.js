/* ─────────────────────────────────────────────
   farmers.js
   農家DB — ここにオブジェクトを1つ足すだけで全ページに農家が追加される
───────────────────────────────────────────── */
const FARMERS = {

  'solato': {
    id: 'solato',
    name: 'solato',
    nameKana: 'ソラト',
    region: { pref: '兵庫県', city: '伊丹市', lat: 34.7848, lng: 135.4231 },
    catchphrase: '農業を、未来の憧れに。',
    tagline: '子どもたちの未来に農業という選択肢を残す農園。',
    story: `私たちは作物を売るためだけに農業をしていません。「農業って面白い」「こんな生き方もあるんだ」と感じてもらうきっかけを届けたいと思っています。伊丹でもこんなに美味しい作物が育つことを知ってもらい、子どもたちの未来に農業という選択肢を残したい。その想いを、私たちの作物と一緒に届けます。`,
    method: `毎年変わる気候や環境を記録し、植物の変化を数字で追い続けながら栽培しています。感覚だけに頼らず、予測と検証を繰り返すことで品質を高めています。手間と時間をかけて育てた作物だからこその価格です。`,
    since: 2019,
    certifications: ['特別栽培', '低農薬'],
    products: ['corn-solato', 'strawberry-solato'],
    sns: { instagram: 'solato_farm', twitter: null },
    /* カード・ヒーローの背景グラデーション */
    gradient: 'linear-gradient(135deg, #1A3220 0%, #2D5830 100%)',
    color: '#2C4A2E',
    accentColor: '#C49A30',
    heroType: 'corn',
  },

  'yamamoto-farm': {
    id: 'yamamoto-farm',
    name: '山本農園',
    nameKana: 'ヤマモトノウエン',
    region: { pref: '北海道', city: '富良野市', lat: 43.3425, lng: 142.3834 },
    catchphrase: '大地の恵みを、まっすぐに。',
    tagline: '北海道富良野の雄大な大地で30年以上、土と向き合ってきた農家です。',
    story: `富良野の澄んだ空気と肥沃な大地で、30年以上野菜を育ててきました。農薬を極力使わない栽培にこだわり、土の力を最大限に引き出すことを使命にしています。この土地に生まれ、この土地で育ち、この土地の野菜を食卓に届けることが、私の誇りです。`,
    method: `有機肥料のみを使った土づくりから始まります。北海道の短い夏と昼夜の寒暖差を活かし、糖度の高い作物を育てます。冬の間に土を休ませ、春に丁寧に準備する——その繰り返しが味の根本です。`,
    since: 1992,
    certifications: ['有機JAS認定', '特別栽培'],
    products: ['potato-yamamoto', 'onion-yamamoto'],
    sns: { instagram: null, twitter: null },
    gradient: 'linear-gradient(135deg, #1E1A0A 0%, #3A3010 100%)',
    color: '#3D4F7C',
    accentColor: '#7B9ED9',
    heroType: 'potato',
  },

  'sunrise-orchard': {
    id: 'sunrise-orchard',
    name: 'サンライズオーチャード',
    nameKana: 'サンライズオーチャード',
    region: { pref: '山梨県', city: '甲州市', lat: 35.6634, lng: 138.7453 },
    catchphrase: '太陽と向き合い続けた果実。',
    tagline: '日本一の日照を誇る山梨で、三代にわたって果実を育ててきました。',
    story: `祖父の代から続く甲州の果樹農家です。葡萄・桃・りんごと、季節ごとに旬の果物をお届けしてきました。日本一の日照時間を誇るこの土地で、太陽と向き合い続けることが私たちの仕事です。`,
    method: `土壌分析を年4回実施し、木一本一本の状態を丁寧に管理します。剪定・摘果を繰り返し、一本の木から取れる実を最小限に絞ることで、甘みと香りを一粒に凝縮させています。`,
    since: 1978,
    certifications: ['特別栽培'],
    products: ['grape-sunrise', 'peach-sunrise'],
    sns: { instagram: 'sunrise_orchard', twitter: null },
    gradient: 'linear-gradient(135deg, #180820 0%, #2C1240 100%)',
    color: '#7A3B5A',
    accentColor: '#D4799A',
    heroType: 'grape',
  },

  'tanaka-farm': {
    id: 'tanaka-farm',
    name: '卵の里 田中農場',
    nameKana: 'タマゴノサト タナカノウジョウ',
    region: { pref: '岡山県', city: '真庭市', lat: 35.0878, lng: 133.7625 },
    catchphrase: '鶏が笑う農場の卵。',
    tagline: '広い鶏舎でのびのびと育てた鶏の、黄身が濃い卵をお届けします。',
    story: `岡山県の山あいで、鶏を平飼いで育てています。鶏1羽あたりの面積を一般的な農場の5倍確保し、ストレスなく生活できる環境を整えています。鶏が幸せだと、卵もおいしい。そう信じて20年続けてきました。`,
    method: `非遺伝子組み換えの国産飼料を使用し、抗生物質は一切使いません。自然光の中で自由に動き回った鶏の卵は、黄身が濃くてコクがあります。毎朝手作業で選別し、当日または翌日発送します。`,
    since: 2005,
    certifications: ['平飼い認定', 'アニマルウェルフェア'],
    products: ['egg-tanaka'],
    sns: { instagram: null, twitter: null },
    gradient: 'linear-gradient(135deg, #141008 0%, #281E10 100%)',
    color: '#7A5C2E',
    accentColor: '#D4A853',
    heroType: 'egg',
  },

};
