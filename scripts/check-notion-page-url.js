const fs = require("fs");
const vm = require("vm");
const path = require("path");

const backgroundPath = path.join(__dirname, "..", "background.js");
const source = fs.readFileSync(backgroundPath, "utf8");
const start = source.indexOf("function buildNotionPageUrl");
const end = source.indexOf("function normalizeTitleForCompare", start);
const context = {};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context, { filename: backgroundPath });

const apiUrl = "https://www.notion.so/Project-abcdef1234567890";
if (context.buildNotionPageUrl({ id: "ignored", url: apiUrl }) !== apiUrl) {
  throw new Error("Notion APIのURLを維持できませんでした");
}

const fallback = context.buildNotionPageUrl({
  id: "12345678-1234-1234-1234-123456789abc",
  url: "",
});
if (fallback !== "https://www.notion.so/12345678123412341234123456789abc") {
  throw new Error(`ページIDからのURL生成に失敗しました: ${fallback}`);
}

if (context.buildNotionPageUrl({ id: "", url: "" }) !== "") {
  throw new Error("ページ情報がない場合に空文字以外が返されました");
}

console.log("NotionページURLチェックOK: API URL・ページIDフォールバック・空データ");
