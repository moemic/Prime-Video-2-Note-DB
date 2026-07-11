const fs = require("fs");
const vm = require("vm");
const path = require("path");

const contentPath = path.join(__dirname, "..", "content.js");
const source = fs.readFileSync(contentPath, "utf8");
const helperSource = source.split("// 画像のファイルサイズを取得する")[0];
const context = {};

vm.createContext(context);
vm.runInContext(helperSource, context, { filename: contentPath });

const cases = [
  ["エクスパンス  ～巨獣めざめる～のシーズン6を視聴 - Prime Video", "エクスパンス ～巨獣めざめる～ シーズン6"],
  ["プロジェクト・ヘイル・メアリーをオンラインで視聴 - Prime Video", "プロジェクト・ヘイル・メアリー"],
  ["通常作品を視聴 | Prime Video", "通常作品"],
  ["ある物語の始まりを視聴 - Prime Video", "ある物語の始まり"],
  ["オンライン・ゲーム — Prime Video", "オンライン・ゲーム"],
  ["作品名のシーズン１２を観る", "作品名 シーズン１２"],
];

for (const [input, expected] of cases) {
  const actual = context.cleanTitle(input);
  if (actual !== expected) {
    console.error(`タイトル整形NG:\n入力: ${input}\n期待: ${expected}\n実際: ${actual}`);
    process.exit(1);
  }
}

console.log(`タイトル整形チェックOK: ${cases.length}件`);
