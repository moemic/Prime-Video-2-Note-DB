const fs = require("fs");
const vm = require("vm");
const path = require("path");

const popupPath = path.join(__dirname, "..", "popup.js");
const source = fs.readFileSync(popupPath, "utf8");
const helpers = source.slice(0, source.indexOf("// DOM要素"));
const context = {};

vm.createContext(context);
vm.runInContext(helpers, context, { filename: popupPath });

const primary = JSON.parse(vm.runInContext("JSON.stringify(PRIMARY_CATEGORIES)", context));
const expectedPrimary = ["外国映画", "映画", "ドラマ", "アニメ"];
if (JSON.stringify(primary) !== JSON.stringify(expectedPrimary)) {
  throw new Error(`主要カテゴリが不正です: ${JSON.stringify(primary)}`);
}

const secondary = JSON.parse(vm.runInContext(
  'JSON.stringify(getSecondaryCategoryOptions(["ドラマ", "サスペンス", "海外映画", "外国映画", "重苦しい", "サスペンス"]))',
  context
));
const expectedSecondary = ["サスペンス", "重苦しい"];
if (JSON.stringify(secondary) !== JSON.stringify(expectedSecondary)) {
  throw new Error(`ジャンル・雰囲気の振り分けが不正です: ${JSON.stringify(secondary)}`);
}

const normalized = JSON.parse(vm.runInContext(
  'JSON.stringify(normalizeCategoryOptions(["海外映画", "外国映画", "ドラマ"]))',
  context
));
if (JSON.stringify(normalized) !== JSON.stringify(["外国映画", "ドラマ"])) {
  throw new Error(`旧カテゴリ名のUI正規化が不正です: ${JSON.stringify(normalized)}`);
}

console.log("主要カテゴリチェックOK: 固定4件・旧名称正規化・重複除去・下段振り分け");

const assert = require("node:assert/strict");
const content = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const categoryCode = content.slice(content.indexOf("function extractPrimeCategories("), content.indexOf("// タイトルの正準化"));
const document = { querySelector: () => null, querySelectorAll: () => [{textContent: "ホラー"}] };
const extract = vm.runInNewContext(categoryCode + "\nextractPrimeCategories", { document });
assert.deepEqual([...extract("[コメディ/ギャグ][ドラマ/青春][ホラー/サスペンス/推理]本文")],
  ["ホラー", "コメディ", "ギャグ", "ドラマ", "青春", "サスペンス", "推理"]);
assert.deepEqual([...extract("[字幕版]本文[ドラマ/青春]")], ["ホラー"]);

let keydown;
const added = [];
const categoryInput = { addEventListener: (_, fn) => { keydown = fn; }, focus() {} };
vm.runInNewContext(source.slice(source.indexOf('categoryInput.addEventListener("keydown"'), source.indexOf("function addCategory(")),
  { categoryInput, addCategory: value => added.push(value) });
for (const value of ["青春", "推理"]) {
  categoryInput.value = value;
  keydown({ key: "Enter", isComposing: true, preventDefault: () => assert.fail("変換確定を妨げた") });
  assert.equal(categoryInput.value, value);
  keydown({ key: "Enter", preventDefault() {} });
  assert.equal(categoryInput.value, "");
}
assert.deepEqual(added, ["青春", "推理"]);
