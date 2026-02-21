const NOTION_VERSION = "2022-06-28";
const NOTION_FILE_NAME_MAX_LENGTH = 100;
const NOTION_TEXT_MAX_LENGTH = 2000;
const SIMILARITY_THRESHOLD = 0.55;
const CANDIDATE_LIMIT = 5;
const QUERY_PAGE_SIZE = 100;
const MAX_CANDIDATE_SCAN_PAGES = 3;
const NOTION_MIN_INTERVAL_MS = 350;
const NOTION_MAX_RETRIES = 5;
let notionQueue = Promise.resolve();
let lastNotionRequestAt = 0;

// Amazon宣伝文パターン（content.jsと共通）
const AMAZON_PROMOTION_PATTERNS = [
    /【プ?プ?ラ?イ?ド会員なら.*話までお試し見放題】/,
    /【.*話お試し.*】/,
    /プライム会員なら.*話まで.*$/,
    /Prime Videoで.*$/,
];

// Amazon宣伝文が含まれているかチェック（content.jsと共通）
function hasAmazonPromotion(text) {
    if (!text) return false;
    const cleanText = text.trim();
    return AMAZON_PROMOTION_PATTERNS.some(pattern => pattern.test(cleanText));
}

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

function trimNotionFileName(name, fallback = "image") {
    const normalized = (typeof name === "string" ? name : "").trim() || fallback;
    return normalized.length > NOTION_FILE_NAME_MAX_LENGTH
        ? normalized.slice(0, NOTION_FILE_NAME_MAX_LENGTH)
        : normalized;
}

function trimNotionText(text) {
    const normalized = typeof text === "string" ? text : "";
    return normalized.length > NOTION_TEXT_MAX_LENGTH
        ? normalized.slice(0, NOTION_TEXT_MAX_LENGTH)
        : normalized;
}

function stableHash(input) {
    let hash = 2166136261;
    const text = String(input || "");
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeTitleForCompare(rawTitle) {
    if (!rawTitle) return "";
    return String(rawTitle)
        .normalize("NFKC")
        .trim()
        .replace(/^Amazon\.co\.jp[:：]\s*/i, "")
        .replace(/\s*\|\s*Prime Video$/i, "")
        .replace(/\s*を観る$/, "")
        .replace(/[()（）［］\[\]「」『』【】]/g, "")
        .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~！？、。・：；]/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

function toBigrams(text) {
    if (!text) return new Set();
    if (text.length === 1) return new Set([text]);
    const set = new Set();
    for (let i = 0; i < text.length - 1; i++) {
        set.add(text.slice(i, i + 2));
    }
    return set;
}

function calcSimilarityScore(inputTitle, candidateTitle) {
    const a = normalizeTitleForCompare(inputTitle);
    const b = normalizeTitleForCompare(candidateTitle);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) {
        const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
        return 0.75 + ratio * 0.2;
    }
    const aSet = toBigrams(a);
    const bSet = toBigrams(b);
    if (aSet.size === 0 || bSet.size === 0) return 0;
    let intersection = 0;
    for (const token of aSet) {
        if (bSet.has(token)) intersection++;
    }
    const union = aSet.size + bSet.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runNotionRequest(fn) {
    const task = notionQueue.then(async () => {
        const waitMs = Math.max(0, NOTION_MIN_INTERVAL_MS - (Date.now() - lastNotionRequestAt));
        if (waitMs > 0) await sleep(waitMs);
        lastNotionRequestAt = Date.now();
        return fn();
    });
    notionQueue = task.catch(() => undefined);
    return task;
}

async function notionFetch(url, options = {}, retries = NOTION_MAX_RETRIES) {
    const response = await runNotionRequest(() => fetch(url, options));
    if (response.status !== 429) return response;

    if (retries <= 0) return response;
    const retryAfterSec = Number(response.headers.get("Retry-After")) || 2;
    await sleep((retryAfterSec * 1000) + 250);
    return notionFetch(url, options, retries - 1);
}

function buildMergedImageFiles(payload) {
    let allImages = [];

    if (payload.existingFiles && Array.isArray(payload.existingFiles)) {
        allImages = payload.existingFiles
            .map((file, i) => ({
                name: trimNotionFileName(file?.name, `image_${i + 1}`),
                type: "external",
                external: { url: file?.external?.url || "" }
            }))
            .filter(file => Boolean(file.external.url));
    }

    if (payload.image) {
        const isAlreadyAdded = allImages.some(f => f.external?.url === payload.image);
        if (!isAlreadyAdded) {
            const safeChars = stableHash(payload.image).slice(0, 10);
            allImages.push({
                "name": trimNotionFileName(`cover_${safeChars}`, "cover_image"),
                "type": "external",
                "external": { "url": payload.image }
            });
        }
    }

    if (payload.images && payload.images.length > 0) {
        payload.images.forEach((url, i) => {
            const isAlreadyAdded = allImages.some(f => f.external?.url === url);
            if (!isAlreadyAdded) {
                const safeChars = stableHash(url).slice(0, 10);
                allImages.push({
                    "name": trimNotionFileName(`image_${Date.now()}_${i}_${safeChars}`, `image_${i + 1}`),
                    "type": "external",
                    "external": { "url": url }
                });
            }
        });
    }

    return allImages;
}

async function createNotionPage({ notionToken, notionDbId, payload }) {
    const pageId = payload.pageId; // 既存IDがあれば更新
    const method = pageId ? "PATCH" : "POST";
    const url = pageId ? `https://api.notion.com/v1/pages/${pageId}` : "https://api.notion.com/v1/pages";

    // 動画鑑賞リストDBのプロパティ構造
    const properties = {
        "Name": { "title": [{ "text": { "content": trimNotionText(payload.title || "") } }] },
        "URL": { "url": payload.url || null },
<<<<<<< HEAD
        "概要": { "rich_text": [{ "text": { "content": trimNotionText(payload.description || "") } }] },
        "著者": { "rich_text": [{ "text": { "content": trimNotionText(payload.director || "") } }] },
        "日付": { "date": { "start": payload.date || new Date().toISOString().split('T')[0] } }
    };

    // ASINを保存（作品固有の管理番号）
    if (payload.asin) {
        properties["ASIN"] = { "rich_text": [{ "text": { "content": trimNotionText(payload.asin) } }] };
    }

    // 公開日を保存（年のみの場合は1月1日として保存）
    if (payload.releaseYear) {
        properties["公開日"] = { "date": { "start": `${payload.releaseYear}-01-01` } };
    }

    // ステータスの設定（status型またはselect型に対応）
    // payload.statusType が渡されていればそれに従い、なければデフォルトで status を試す
    const statusVal = payload.status || "鑑賞終了";
    const statusType = payload.statusType || "status";
    properties["ステータス"] = { [statusType]: { "name": statusVal } };

    // サムネイルを「カバー画像」プロパティ（Files & media）に入れる
    const allImages = buildMergedImageFiles(payload);
    if (allImages.length > 0) {
        // TODO: Notionデータベースの実際のプロパティ名に置換えてください
        // 例: properties["封面画像"] や properties["Files"] 等
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

    // ページカバー画像の設定条件:
    // 1. 新規作成の場合は常にセット
    // 2. 既存ページでカバーがない場合はセット
    // 3. 既存ページでもoverwriteCoverがtrueならセット（上書き）
    // pageCoverImageが指定されていればそれを使用、なければimageを使用
    const pageCoverUrl = payload.pageCoverImage || payload.image;
    if (pageCoverUrl && (!pageId || !payload.hasCover || payload.overwriteCover)) {
        body.cover = { type: "external", external: { url: pageCoverUrl } };
    }

    const res = await notionFetch(url, {
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
        const cRes = await notionFetch("https://api.notion.com/v1/comments", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${notionToken}`,
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "parent": { "page_id": newPage.id },
                "rich_text": [{ "text": { "content": trimNotionText(payload.comment) } }]
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

async function completeNotionPage({ notionToken, payload }) {
    if (!payload?.pageId) {
        throw new Error("pageId is required for completion");
    }

    const url = `https://api.notion.com/v1/pages/${payload.pageId}`;
    const properties = {};

    if (payload.title) {
        properties["Name"] = { "title": [{ "text": { "content": trimNotionText(payload.title) } }] };
    }
    if (payload.url) {
        properties["URL"] = { "url": payload.url };
    }
    if (payload.description) {
        properties["概要"] = { "rich_text": [{ "text": { "content": trimNotionText(payload.description) } }] };
    }
    if (payload.director) {
        properties["著者"] = { "rich_text": [{ "text": { "content": trimNotionText(payload.director) } }] };
    }
    if (payload.releaseYear) {
        properties["公開日"] = { "date": { "start": `${payload.releaseYear}-01-01` } };
    }
    if (payload.asin) {
        properties["ASIN"] = { "rich_text": [{ "text": { "content": trimNotionText(payload.asin) } }] };
    }

    const allImages = buildMergedImageFiles(payload);
    if (allImages.length > 0) {
        properties["カバー画像"] = { "files": allImages };
    }

    const body = { properties };
    const pageCoverUrl = payload.pageCoverImage || payload.image;
    if (pageCoverUrl && (!payload.hasCover || payload.overwriteCover)) {
        body.cover = { type: "external", external: { url: pageCoverUrl } };
    }

    const res = await notionFetch(url, {
        method: "PATCH",
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
    return res.json();
}

async function getNotionDatabaseTags({ notionToken, notionDbId }) {
    const res = await notionFetch(`https://api.notion.com/v1/databases/${notionDbId}`, {
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
    const res = await notionFetch(`https://api.notion.com/v1/databases/${notionDbId}`, {
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
    const title = props["Name"]?.title ? props["Name"].title.map(t => t.plain_text).join("") : "";
    return {
        duplicate: true,
        pageId: page.id,
        url: page.url,
        title: title,
        rating: props["オススメ度"]?.select ? selectNameToRating(props["オススメ度"].select.name) : 0,
        tags: props["ジャンル"]?.multi_select ? props["ジャンル"].multi_select.map(t => t.name) : [],
        description: props["概要"]?.rich_text ? props["概要"].rich_text.map(t => t.plain_text).join("") : "",
        director: props["著者"]?.rich_text ? props["著者"].rich_text.map(t => t.plain_text).join("") : "",
        date: props["日付"]?.date ? props["日付"].date.start : "",
        status: props["ステータス"]?.status ? props["ステータス"].status.name : (props["ステータス"]?.select ? props["ステータス"].select.name : ""),
        hasCover: !!page.cover,
        existingFiles: (props["カバー画像"]?.files || []).filter(file => Boolean(file?.external?.url)),
        asin: props["ASIN"]?.rich_text ? props["ASIN"].rich_text.map(t => t.plain_text).join("") : "",
    };
}

async function queryNotionDatabase({ notionToken, notionDbId, filter, pageSize = QUERY_PAGE_SIZE, startCursor }) {
    const requestBody = { page_size: pageSize };
    if (filter) requestBody.filter = filter;
    if (startCursor) requestBody.start_cursor = startCursor;

    const res = await notionFetch(`https://api.notion.com/v1/databases/${notionDbId}/query`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${notionToken}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status} ${res.statusText}`);
    }

    return res.json();
}

async function findTitleCandidates({ notionToken, notionDbId, title, normalizedTitle }) {
    const targetTitle = normalizedTitle || title;
    if (!targetTitle) return [];

    let cursor = undefined;
    let scannedPages = 0;
    const candidates = [];

    while (scannedPages < MAX_CANDIDATE_SCAN_PAGES) {
        const data = await queryNotionDatabase({
            notionToken,
            notionDbId,
            pageSize: QUERY_PAGE_SIZE,
            startCursor: cursor
        });

        const pages = data.results || [];
        for (const page of pages) {
            const record = buildExistingData(page);
            const score = calcSimilarityScore(targetTitle, record.title);
            if (score >= SIMILARITY_THRESHOLD) {
                candidates.push({
                    ...record,
                    duplicate: false,
                    score: Number(score.toFixed(2))
                });
            }
        }

        scannedPages++;
        if (!data.has_more || !data.next_cursor) break;
        cursor = data.next_cursor;
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, CANDIDATE_LIMIT);
}

async function checkDuplicateByAsin({ notionToken, notionDbId, asin, title, normalizedTitle }) {
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

    // 2. タイトルで照合（フォールバック: 正準化タイトルを使用）
    if (title) {
        // 正準化タイトルがあれば使用
        const searchTitle = normalizedTitle || title;
        const filters = [{ property: "Name", title: { equals: title } }];
        if (searchTitle !== title) {
            filters.push({ property: "Name", title: { equals: searchTitle } });
        }

        const data = await queryNotionDatabase({
            notionToken, notionDbId,
            filter: filters.length === 1 ? filters[0] : { or: filters }
        });
        if (data.results && data.results.length > 0) {
            const existingAsin = data.results[0].properties["ASIN"]?.rich_text?.map(t => t.plain_text).join("") || "";

            // 両方にASINがあり、かつ異なる場合は別作品（シーズン違い等）
            if (asin && existingAsin && asin !== existingAsin) {
                const candidates = await findTitleCandidates({ notionToken, notionDbId, title, normalizedTitle });
                return { duplicate: false, candidates };
            }

            const result = buildExistingData(data.results[0]);

            // ASINが未設定の場合は補完する
            if (asin && result.pageId && !existingAsin) {
                try {
                    await notionFetch(`https://api.notion.com/v1/pages/${result.pageId}`, {
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

            // ASINが変更されている場合は上書き更新する（Amazon側の変更に対応）
            if (asin && result.pageId && existingAsin && asin !== existingAsin) {
                try {
                    const updateRes = await notionFetch(`https://api.notion.com/v1/pages/${result.pageId}`, {
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

                    if (updateRes.ok) {
                        result.asin = asin;
                        result.asinUpdated = true; // 更新フラグを追加
                    }
                } catch (e) {
                    console.warn("ASIN update failed:", e.message);
                }
            }

            return result;
        }
    }

    const candidates = await findTitleCandidates({ notionToken, notionDbId, title, normalizedTitle });
    return { duplicate: false, candidates };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "CREATE_NOTION_PAGE") {
        (async () => {
            const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
            try {
                const page = await createNotionPage({ notionToken, notionDbId, payload: msg.payload });

                // Amazon宣伝文チェック
                if (msg.payload.hasPromotion) {
                    sendResponse({ ok: true, id: page.id, warning: "Amazon宣伝文が含まれています。手動で削除してください。" });
                } else {
                    sendResponse({ ok: true, id: page.id });
                }
            } catch (e) {
                console.error("Notion API Error:", e);
                sendResponse({ ok: false, error: String(e.message || e) });
            }
        })();
        return true;
    }

    if (msg?.type === "COMPLETE_NOTION_PAGE") {
        (async () => {
            const { notionToken } = await chrome.storage.local.get(["notionToken"]);
            try {
                const page = await completeNotionPage({ notionToken, payload: msg.payload });
                sendResponse({ ok: true, id: page.id });
            } catch (e) {
                console.error("Notion Completion Error:", e);
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
                const result = await checkDuplicateByAsin({
                    notionToken,
                    notionDbId,
                    asin: msg.asin,
                    title: msg.title,
                    normalizedTitle: msg.normalizedTitle
                });
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
