/* ─────────────────────────────────────────────
   categories.js
   カテゴリー定義 — ここにカテゴリーを追加するだけで全ページに反映
───────────────────────────────────────────── */
const CATEGORIES = {
  vegetables: {
    id: 'vegetables',
    label: '野菜',
    labelEn: 'Vegetables',
    icon: '🥦',
    color: '#2D6A4F',
    subcategories: ['corn','tomato','lettuce','potato','onion','pumpkin','carrot','cucumber','eggplant','spinach'],
  },
  fruits: {
    id: 'fruits',
    label: '果物',
    labelEn: 'Fruits',
    icon: '🍓',
    color: '#A32C40',
    subcategories: ['strawberry','mikan','grape','peach','apple','blueberry','kiwi','plum','fig'],
  },
  grains: {
    id: 'grains',
    label: '米・穀物',
    labelEn: 'Grains & Rice',
    icon: '🌾',
    color: '#7A6030',
    subcategories: ['rice','wheat','soba','barley','millet'],
  },
  eggs_dairy: {
    id: 'eggs_dairy',
    label: '卵・乳製品',
    labelEn: 'Eggs & Dairy',
    icon: '🥚',
    color: '#7A5C2E',
    subcategories: ['egg','milk','cheese','butter','yogurt'],
  },
  processed: {
    id: 'processed',
    label: '加工品',
    labelEn: 'Processed',
    icon: '🫙',
    color: '#3D4F7C',
    subcategories: ['jam','pickle','sauce','dried','miso','juice','vinegar'],
  },
  sets: {
    id: 'sets',
    label: '旬のセット',
    labelEn: 'Seasonal Sets',
    icon: '📦',
    color: '#4A3D6A',
    subcategories: ['seasonal','gift','subscription','assorted'],
  },
};
