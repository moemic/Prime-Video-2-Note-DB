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

async function createNotionPage({ notionToken, notionDbId, payload }) {
    // 動画鑑賞リストDBのプロパティ構造
    const properties = {
        "Name": { "title": [{ "text": { "content": payload.title || "" } }] },
        "URL": { "url": payload.url || null },
        "概要": { "rich_text": [{ "text": { "content": payload.description || "" } }] },
        "鑑賞終了": { "checkbox": true },
        "ステータス": { "select": { "name": "鑑賞終了" } }
    };

    // サムネイルを「カバー画像」プロパティ（Files & media）に入れる
    // 選択された画像 + 残りの画像をすべて保存
    const allImages = [];
    if (payload.image) {
        allImages.push({ "name": "cover", "external": { "url": payload.image } });
    }
    if (payload.images && payload.images.length > 0) {
        payload.images.forEach((url, i) => {
            allImages.push({ "name": `image_${i + 1}`, "external": { "url": url } });
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
    }

    // レーティングを「オススメ度」（select）に入れる
    if (payload.rating && payload.rating > 0) {
        const ratingName = ratingToSelectName(payload.rating);
        if (ratingName) {
            properties["オススメ度"] = { "select": { "name": ratingName } };
        }
    }

    const body = {
        parent: { database_id: notionDbId },
        properties
    };

    // ページ自体のカバー画像にも設定
    if (payload.image) {
        body.cover = { type: "external", external: { url: payload.image } };
    }

    // 1. ページを作成
    const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
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

    // 2. コメントがあれば、Notionのコメント機能を使って投稿 (POST /v1/comments)
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "CREATE_NOTION_PAGE") {
        (async () => {
            const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
            try {
                await createNotionPage({ notionToken, notionDbId, payload: msg.payload });
                sendResponse({ ok: true });
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
});
