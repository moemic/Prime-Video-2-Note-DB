const fs = require("fs");
const path = require("path");

const popupPath = path.join(__dirname, "..", "popup.js");
const source = fs.readFileSync(popupPath, "utf8");
const reloadHandler = source.match(
  /reloadBtn\.addEventListener\(\s*["']click["']\s*,\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\);/
);
const resetFunction = source.match(
  /function\s+resetPageStateForNewExtraction\s*\(\s*\)\s*\{([\s\S]*?)\n\}/
);

if (!reloadHandler || !/\bresetPageStateForNewExtraction\s*\(\s*\)/.test(reloadHandler[1])) {
  console.error("再読み込み処理が共通作品状態リセットを呼んでいません");
  process.exit(1);
}

if (!resetFunction || !/hallOfFameEl\.checked\s*=\s*false\s*;/.test(resetFunction[1])) {
  console.error("再読み込み処理で殿堂入り状態が初期化されていません");
  process.exit(1);
}

console.log("ページ状態リセットチェックOK: 再読み込み経路・殿堂入りfalse初期化");
