#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const backgroundPath = path.join(__dirname, "..", "background.js");
const source = fs.readFileSync(backgroundPath, "utf8");
const popupPath = path.join(__dirname, "..", "popup.js");
const popupSource = fs.readFileSync(popupPath, "utf8");
const popupHtmlPath = path.join(__dirname, "..", "popup.html");
const popupHtmlSource = fs.readFileSync(popupHtmlPath, "utf8");
const helpers = source.slice(0, source.indexOf("chrome.runtime.onMessage.addListener"));

function makeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: () => null },
    json: async () => body
  };
}

function makePage(id, categories) {
  return { id, properties: { "カテゴリ": { multi_select: categories.map(name => ({ name })) } } };
}

function createMockNotion({ pages, options, failPageId }) {
  const state = { pages, options, queryCalls: 0, schemaPatchQueryCounts: [], schemaPatchPayloads: [] };
  const database = () => ({
    properties: {
      "カテゴリ": { type: "multi_select", multi_select: { options: state.options.map(option => ({ ...option })) } }
    }
  });

  return {
    state,
    fetch: async (url, request = {}) => {
      if (url.endsWith("/query")) {
        const body = JSON.parse(request.body);
        assert.deepStrictEqual(body.filter, { property: "カテゴリ", multi_select: { contains: "海外映画" } });
        assert.strictEqual(body.start_cursor, undefined, "移行検索でcursorを使わない");
        state.queryCalls++;
        return makeResponse({
          results: state.pages.filter(page => page.properties["カテゴリ"].multi_select.some(item => item.name === "海外映画")),
          has_more: false,
          next_cursor: null
        });
      }
      if (url.includes("/pages/")) {
        const pageId = url.split("/").pop();
        if (pageId === failPageId) return makeResponse({ message: "intentional failure" }, 500);
        const page = state.pages.find(item => item.id === pageId);
        page.properties["カテゴリ"].multi_select = JSON.parse(request.body).properties["カテゴリ"].multi_select;
        return makeResponse(page);
      }
      if (request.method === "PATCH") {
        state.schemaPatchQueryCounts.push(state.queryCalls);
        const optionPayload = JSON.parse(request.body).properties["カテゴリ"].multi_select.options;
        assert.ok(optionPayload.every(option => Object.keys(option).length === 1 && option.id), "schema PATCHはoption IDのみを送る");
        const existingOptions = new Map(state.options.map(option => [option.id, option]));
        state.options = optionPayload.map(option => {
          const existingOption = existingOptions.get(option.id);
          assert.ok(existingOption, `未知のoption IDを送らない: ${option.id}`);
          return { ...existingOption };
        });
        state.schemaPatchPayloads.push(optionPayload);
        return makeResponse(database());
      }
      return makeResponse(database());
    }
  };
}

function loadMigration(mock) {
  const chrome = {
    storage: { local: { get: async () => ({}) } },
    action: { setPopup: async () => {} },
    sidePanel: { setPanelBehavior: async () => {} },
    runtime: { onInstalled: { addListener: () => {} } }
  };
  const context = { chrome, console, fetch: mock.fetch, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(helpers, context, { filename: backgroundPath });
  return {
    normalizeCategories: vm.runInContext("normalizeCategories", context),
    migrateForeignMovieCategory: vm.runInContext("migrateForeignMovieCategory", context)
  };
}

async function main() {
  assert.match(source, /const merged = normalizeCategories\(\[\.\.\.category, \.\.\.genre\]\);/, "ジャンル統合でもカテゴリ正規化を適用する");
  const foreignMovieMigrationUi = popupSource.slice(
    popupSource.indexOf("migrateForeignMovieBtn.addEventListener"),
    popupSource.indexOf("// タイトル変更時に重複チェックを再実行")
  );
  const foreignMovieMigrationButton = popupHtmlSource.match(/<button[^>]*id="migrateForeignMovieBtn"[^>]*>([^<]*)<\/button>/);
  assert.ok(foreignMovieMigrationButton, "外国映画移行ボタンが存在する");
  assert.doesNotMatch(foreignMovieMigrationButton[1], /海外映画/, "設定ボタンに旧カテゴリ名を表示しない");
  assert.doesNotMatch(foreignMovieMigrationUi, /海外映画/, "移行ハンドラの利用者向け文言に旧カテゴリ名を表示しない");
  assert.match(foreignMovieMigrationUi, /migrationStatusEl\.textContent = `移行失敗: \$\{error\.message\}`;/, "移行失敗時に結果不明の削除状態を断定しない");
  assert.doesNotMatch(foreignMovieMigrationUi, /旧選択肢は削除していません/, "移行失敗時に旧選択肢未削除を断定しない");

  const normalizer = loadMigration(createMockNotion({ pages: [], options: [] })).normalizeCategories;
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(normalizer(["海外映画", "アクション", "外国映画", "海外映画"]))),
    ["外国映画", "アクション"],
    "旧新カテゴリを重複なく正規化する"
  );

  const mock = createMockNotion({
    pages: [
      makePage("page-1", ["海外映画", "アクション", "外国映画"]),
      makePage("page-2", ["ドラマ", "海外映画"]),
      makePage("page-3", ["アニメ"])
    ],
    options: [
      { id: "old-id", name: "海外映画", color: "blue" },
      { id: "foreign-id", name: "外国映画", color: "green" },
      { id: "action-id", name: "アクション", color: "red" }
    ]
  });
  const migrate = loadMigration(mock).migrateForeignMovieCategory;
  const result = await migrate({ notionToken: "token", notionDbId: "db" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
    alreadyMigrated: false, totalPages: 2, updatedPages: 2, remainingPages: 0, removedOldOption: true
  });
  assert.deepStrictEqual(mock.state.pages[0].properties["カテゴリ"].multi_select.map(item => item.name), ["外国映画", "アクション"]);
  assert.deepStrictEqual(mock.state.pages[1].properties["カテゴリ"].multi_select.map(item => item.name), ["ドラマ", "外国映画"]);
  assert.deepStrictEqual(mock.state.pages[2].properties["カテゴリ"].multi_select.map(item => item.name), ["アニメ"]);
  assert.deepStrictEqual(mock.state.options, [
    { id: "foreign-id", name: "外国映画", color: "green" },
    { id: "action-id", name: "アクション", color: "red" }
  ], "旧選択肢だけを削除し、他のoption IDを保持する");
  assert.deepStrictEqual(mock.state.schemaPatchPayloads, [[
    { id: "foreign-id" },
    { id: "action-id" }
  ]], "旧選択肢削除PATCHは既存optionのIDだけを送る");
  assert.deepStrictEqual(mock.state.schemaPatchQueryCounts, [3], "0件再確認後だけ旧選択肢を削除する");

  const idempotentMock = createMockNotion({
    pages: [makePage("page-4", ["外国映画", "ドラマ"])],
    options: [{ id: "foreign-id", name: "外国映画", color: "green" }]
  });
  const idempotent = await loadMigration(idempotentMock).migrateForeignMovieCategory({ notionToken: "token", notionDbId: "db" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(idempotent)), {
    alreadyMigrated: true, totalPages: 0, updatedPages: 0, remainingPages: 0, removedOldOption: false
  });
  assert.deepStrictEqual(idempotentMock.state.schemaPatchQueryCounts, [], "移行済みならスキーマを変更しない");

  const failureMock = createMockNotion({
    pages: [makePage("page-fail", ["海外映画", "アクション"])],
    options: [{ id: "old-id", name: "海外映画", color: "blue" }],
    failPageId: "page-fail"
  });
  await assert.rejects(
    loadMigration(failureMock).migrateForeignMovieCategory({ notionToken: "token", notionDbId: "db" }),
    /カテゴリ移行に失敗/
  );
  assert.deepStrictEqual(failureMock.state.schemaPatchQueryCounts, [], "ページ更新失敗時は旧選択肢を削除しない");

  console.log("外国映画カテゴリ移行チェックOK: 正規化・全件更新・確認後削除・冪等性・失敗時保護");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
