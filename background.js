const NOTION_VERSION = "2022-06-28";

// レーティング番号からNotionセレクト名への変換
function ratingToSelectName(rating) {
    const map = {
        5: "★★★★★",
        4: "★★★★☆",
        3: "★★★☆☆",
        2: "★★☆☆☆",
        1: "★☆☆☆☆"
    };
    return map[rating] || null;
}

// セレクト名からレーティング番号への変換
function selectNameToRating(name) {
    const map = {
        "★★★★★": 5,
        "★★★★☆": 4,
        "★★★☆☆": 3,
        "★★☆☆☆": 2,
        "★☆☆☆☆": 1
    };
    return map[name] || 0;
}

async function createNotionPage({ notionToken, notionDbId, payload }) {
    const pageId = payload.pageId; // 既存IDがあれば更新
    const method = pageId ? "PATCH" : "POST";
    const url = pageId ? `https://api.notion.com/v1/pages/${pageId}` : "https://api.notion.com/v1/pages";

    // 動画鑑賞リストDBのプロパティ構造
    const properties = {
        "Name": { "title": [{ "text": { "content": payload.title || "" } }] },
        "URL": { "url": payload.url || null },
        "概要": { "rich_text": [{ "text": { "content": payload.description || "" } }] },
        "鑑賞終了": { "checkbox": true },
        "著者": { "rich_text": [{ "text": { "content": payload.director || "" } }] },
        "日付": { "date": { "start": payload.date || new Date().toISOString().split('T')[0] } }
    };

    // ASINを保存（作品固有の管理番号）
    if (payload.asin) {
        properties["ASIN"] = { "rich_text": [{ "text": { "content": payload.asin } }] };
    }

    // ステータスの設定（status型またはselect型に対応）
    // payload.statusType が渡されていればそれに従い、なければデフォルトで status を試す
    const statusVal = payload.status || "鑑賞終了";
    const statusType = payload.statusType || "status";
    properties["ステータス"] = { [statusType]: { "name": statusVal } };

    // サムネイルを「カバー画像」プロパティ（Files & media）に入れる
    let allImages = [];

    // 既存のファイルリストがあればそれをベースにする
    if (payload.existingFiles && Array.isArray(payload.existingFiles)) {
        allImages = [...payload.existingFiles];
    }

    if (payload.image) {
        // すでに同じURLが登録されていないか確認（簡易的な重複排除）
        const isAlreadyAdded = allImages.some(f => f.external?.url === payload.image);
        if (!isAlreadyAdded) {
            allImages.push({ "name": "cover", "external": { "url": payload.image } });
        }
    }
    if (payload.images && payload.images.length > 0) {
        payload.images.forEach((url, i) => {
            const isAlreadyAdded = allImages.some(f => f.external?.url === url);
            if (!isAlreadyAdded) {
                allImages.push({ "name": `image_${Date.now()}_${i}`, "external": { "url": url } });
            }
        });
    }
    if (allImages.length > 0) {
        properties["カバー画像"] = { "files": allImages };
    }

    // タグを「ジャンル」（multi_select）に入れる
    if (payload.tags && payload.tags.length > 0) {
        properties["ジャンル"] = {
            "multi_select": payload.tags.map(tag => ({ "name": tag }))
        };
    } else if (pageId) {
        properties["ジャンル"] = { "multi_select": [] };
    }

    // レーティングを「オススメ度」（select）に入れる
    if (payload.rating && payload.rating > 0) {
        const ratingName = ratingToSelectName(payload.rating);
        if (ratingName) {
            properties["オススメ度"] = { "select": { "name": ratingName } };
        }
    } else if (pageId) {
        properties["オススメ度"] = { "select": null };
    }

    const body = {
        properties
    };

    if (!pageId) {
        body.parent = { database_id: notionDbId };
    }

    // カバー画像の設定条件:
    // 1. 新規作成の場合は常にセット
    // 2. 既存ページでカバーがない場合はセット
    // 3. 既存ページでもoverwriteCoverがtrueならセット（上書き）
    if (payload.image && (!pageId || !payload.hasCover || payload.overwriteCover)) {
        body.cover = { type: "external", external: { url: payload.image } };
    }

    const res = await fetch(url, {
        method: method,
        headers: {
            "Authorization": `Bearer ${notionToken}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status} ${res.statusText}`);
    }

    const newPage = await res.json();

    if (payload.comment) {
        const cRes = await fetch("https://api.notion.com/v1/comments", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${notionToken}`,
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "parent": { "page_id": newPage.id },
                "rich_text": [{ "text": { "content": payload.comment } }]
            })
        });

        if (!cRes.ok) {
            const cError = await cRes.json();
            console.error("Comment API Error Response:", cError);
            throw new Error(`ページは作成されましたが、コメントの投稿に失敗しました: ${cError.message}`);
        }
    }

    return newPage;
}

async function getNotionDatabaseTags({ notionToken, notionDbId }) {
    const res = await fetch(`https://api.notion.com/v1/databases/${notionDbId}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${notionToken}`,
            "Notion-Version": NOTION_VERSION
        }
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status} ${res.statusText}`);
    }

    const db = await res.json();
    const genreProperty = db.properties["ジャンル"];
    if (genreProperty && genreProperty.multi_select) {
        return genreProperty.multi_select.options.map(opt => opt.name);
    }
    return [];
}

async function getNotionStatusOptions({ notionToken, notionDbId }) {
    const res = await fetch(`https://api.notion.com/v1/databases/${notionDbId}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${notionToken}`,
            "Notion-Version": NOTION_VERSION
        }
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status} ${res.statusText}`);
    }

    const db = await res.json();
    const statusProperty = db.properties["ステータス"];
    if (statusProperty) {
        if (statusProperty.status) {
            return { type: "status", options: statusProperty.status.options.map(opt => ({ name: opt.name, color: opt.color })) };
        } else if (statusProperty.select) {
            return { type: "select", options: statusProperty.select.options.map(opt => ({ name: opt.name, color: opt.color })) };
        }
    }
    return { type: "status", options: [] };
}

function buildExistingData(page) {
    const props = page.properties;
    return {
        duplicate: true,
        pageId: page.id,
        url: page.url,
        rating: props["オススメ度"]?.select ? selectNameToRating(props["オススメ度"].select.name) : 0,
        tags: props["ジャンル"]?.multi_select ? props["ジャンル"].multi_select.map(t => t.name) : [],
        description: props["概要"]?.rich_text ? props["概要"].rich_text.map(t => t.plain_text).join("") : "",
        director: props["著者"]?.rich_text ? props["著者"].rich_text.map(t => t.plain_text).join("") : "",
        date: props["日付"]?.date ? props["日付"].date.start : "",
        status: props["ステータス"]?.status ? props["ステータス"].status.name : (props["ステータス"]?.select ? props["ステータス"].select.name : ""),
        hasCover: !!page.cover,
        existingFiles: props["カバー画像"]?.files || []
    };
}

async function queryNotionDatabase({ notionToken, notionDbId, filter }) {
    const res = await fetch(`https://api.notion.com/v1/databases/${notionDbId}/query`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${notionToken}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ filter })
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status} ${res.statusText}`);
    }

    return res.json();
}

async function checkDuplicateByAsin({ notionToken, notionDbId, asin, title }) {
    // 1. ASINで照合（優先）
    if (asin) {
        try {
            const data = await queryNotionDatabase({
                notionToken, notionDbId,
                filter: {
                    property: "ASIN",
                    rich_text: { equals: asin }
                }
            });
            if (data.results && data.results.length > 0) {
                return buildExistingData(data.results[0]);
            }
        } catch (e) {
            // ASINプロパティが存在しない場合（validation_error）のみフォールバック
            if (e.message && (e.message.includes("property") || e.message.includes("validation"))) {
                console.warn("ASIN property not found, falling back to title:", e.message);
            } else {
                throw e;
            }
        }
    }

    // 2. タイトルで照合（フォールバック: ASINが空の既存レコード用）
    if (title) {
        const data = await queryNotionDatabase({
            notionToken, notionDbId,
            filter: {
                property: "Name",
                title: { equals: title }
            }
        });
        if (data.results && data.results.length > 0) {
            const result = buildExistingData(data.results[0]);
            // タイトルで見つかった既存ページにASINが未設定なら補完する
            if (asin && result.pageId) {
                const existingAsin = data.results[0].properties["ASIN"]?.rich_text?.map(t => t.plain_text).join("") || "";
                if (!existingAsin) {
                    try {
                        await fetch(`https://api.notion.com/v1/pages/${result.pageId}`, {
                            method: "PATCH",
                            headers: {
                                "Authorization": `Bearer ${notionToken}`,
                                "Notion-Version": NOTION_VERSION,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                properties: {
                                    "ASIN": { "rich_text": [{ "text": { "content": asin } }] }
                                }
                            })
                        });
                    } catch (e) {
                        console.warn("ASIN auto-fill failed:", e.message);
                    }
                }
            }
            return result;
        }
    }

    return { duplicate: false };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "CREATE_NOTION_PAGE") {
        (async () => {
            const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
            try {
                const page = await createNotionPage({ notionToken, notionDbId, payload: msg.payload });
                sendResponse({ ok: true, id: page.id });
            } catch (e) {
                console.error("Notion API Error:", e);
                sendResponse({ ok: false, error: String(e.message || e) });
            }
        })();
        return true;
    }

    if (msg?.type === "GET_NOTION_TAGS") {
        (async () => {
            const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
            if (!notionToken || !notionDbId) {
                sendResponse({ ok: false, error: "Settings missing" });
                return;
            }
            try {
                const tags = await getNotionDatabaseTags({ notionToken, notionDbId });
                sendResponse({ ok: true, tags });
            } catch (e) {
                console.error("Notion DB Error:", e);
                sendResponse({ ok: false, error: String(e.message || e) });
            }
        })();
        return true;
    }

    if (msg?.type === "CHECK_DUPLICATE") {
        (async () => {
            const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
            if (!notionToken || !notionDbId) {
                sendResponse({ ok: false, error: "Settings missing" });
                return;
            }
            try {
                const result = await checkDuplicateByAsin({ notionToken, notionDbId, asin: msg.asin, title: msg.title });
                sendResponse({ ok: true, ...result });
            } catch (e) {
                console.error("Duplicate Check Error:", e);
                sendResponse({ ok: false, error: String(e.message || e) });
            }
        })();
        return true;
    }

    if (msg?.type === "GET_NOTION_STATUS_OPTIONS") {
        (async () => {
            const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
            if (!notionToken || !notionDbId) {
                sendResponse({ ok: false, error: "Settings missing" });
                return;
            }
            try {
                const result = await getNotionStatusOptions({ notionToken, notionDbId });
                sendResponse({ ok: true, ...result });
            } catch (e) {
                console.error("Notion Status Error:", e);
                sendResponse({ ok: false, error: String(e.message || e) });
            }
        })();
        return true;
    }
});
