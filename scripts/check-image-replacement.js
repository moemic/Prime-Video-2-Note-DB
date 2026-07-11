const fs = require("fs");
const vm = require("vm");
const path = require("path");

const backgroundPath = path.join(__dirname, "..", "background.js");
const source = fs.readFileSync(backgroundPath, "utf8");
const constants = source.slice(0, source.indexOf("// =========================================="));
const helpers = source.slice(
  source.indexOf("function trimNotionFileName"),
  source.indexOf("async function createNotionPage")
);
const context = {};

vm.createContext(context);
vm.runInContext(`${constants}\n${helpers}`, context, { filename: backgroundPath });

const existingFiles = [
  { name: "old-1", external: { url: "https://example.com/old-1.jpg" } },
  { name: "old-2", external: { url: "https://example.com/old-2.jpg" } },
];

const replaced = context.buildMergedImageFiles({
  replaceImages: true,
  existingFiles,
  image: "https://example.com/selected.jpg",
  images: ["https://example.com/other.jpg"],
});

const replacedUrls = replaced.map(file => file.external.url);
const expectedReplacedUrls = [
  "https://example.com/selected.jpg",
  "https://example.com/other.jpg",
];

if (JSON.stringify(replacedUrls) !== JSON.stringify(expectedReplacedUrls)) {
  throw new Error(`完全入れ替え時の画像順序が不正です: ${JSON.stringify(replacedUrls)}`);
}

const preserved = context.buildMergedImageFiles({
  replaceImages: false,
  existingFiles,
  image: "https://example.com/selected.jpg",
  images: [],
});

if (preserved[0]?.external?.url !== existingFiles[0].external.url) {
  throw new Error("通常更新で既存画像の順序が維持されていません");
}

const cleared = context.buildMergedImageFiles({
  replaceImages: true,
  existingFiles,
  image: "",
  images: [],
});

if (cleared.length !== 0) {
  throw new Error("画像なしの完全入れ替えで古い画像が残っています");
}

console.log("画像完全入れ替えチェックOK: 選択画像先頭・通常更新維持・全削除");
