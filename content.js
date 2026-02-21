function getMeta(propertyOrName) {
    const og = document.querySelector(`meta[property="${propertyOrName}"]`);
    if (og?.content) return og.content.trim();
    const nm = document.querySelector(`meta[name="${propertyOrName}"]`);
    if (nm?.content) return nm.content.trim();
    return "";
}

function pickLongest(...candidates) {
    const filtered = candidates.map(s => (s || "").trim()).filter(Boolean);
    if (filtered.length === 0) return "";
    return filtered.sort((a, b) => b.length - a.length)[0];
}

function tryDomText(selectors) {
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        const txt = el?.textContent?.trim();
        if (txt) return txt;
    }
    return "";
}

// JSONデータからtitleshot・packshot・heroshot・covershotを抽出する
// covershot（エピソードサムネイル）は最低優先度で追加
function extractTargetImages() {
    const images = [];
    let packshot = "";
    try {
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (!content || content.length < 100) return;

            const normalizeEscapedUrl = (value) => {
                return (value || "")
                    .replace(/\\u002F/gi, "/")
                    .replace(/\\x2F/gi, "/")
                    .replace(/\\\//g, "/")
                    .trim();
            };

            const collectUrls = (text) => {
                const found = [];
                const urlRegex = /(https?:(?:\\\/\\\/|\/\/)[^"'\\\s]+)/g;
                let urlMatch;
                while ((urlMatch = urlRegex.exec(text)) !== null) {
                    const normalized = normalizeEscapedUrl(urlMatch[1]);
                    if (normalized && isValidImage(normalized)) found.push(normalized);
                }
                return found;
            };

            const pushByKey = (key, onFound) => {
                const keyPattern = `["']?${key}["']?`;

                // 1) titleshot: "https://..."
                const directRegex = new RegExp(`${keyPattern}\\s*:\\s*"([^"]+)"`, "gi");
                let directMatch;
                while ((directMatch = directRegex.exec(content)) !== null) {
                    const normalized = normalizeEscapedUrl(directMatch[1]);
                    if (normalized && isValidImage(normalized)) {
                        if (onFound) onFound(normalized);
                        images.push(normalized);
                    }
                }

                // 2) titleshot: { ... "https://..." ... } のような入れ子
                const objectRegex = new RegExp(`${keyPattern}\\s*:\\s*\\{([\\s\\S]{0,1600}?)\\}`, "gi");
                let objectMatch;
                while ((objectMatch = objectRegex.exec(content)) !== null) {
                    const block = objectMatch[1] || "";
                    const urls = collectUrls(block);
                    for (const url of urls) {
                        if (onFound) onFound(url);
                        images.push(url);
                    }
                }
            };

            // titleshot（タイトル画像）
            if (content.includes('titleshot')) pushByKey("titleshot");

            // packshot（キービジュアル）- 最優先
            if (content.includes('packshot')) {
                pushByKey("packshot", (url) => {
                    if (!packshot) packshot = url;
                });
            }

            // heroshot（バナー画像）
            if (content.includes('heroshot')) pushByKey("heroshot");

            // covershot（エピソードサムネイル）- 最低優先度
            if (content.includes('covershot')) pushByKey("covershot");
        });
    } catch (e) {
        console.error("Image extraction error", e);
    }
    console.debug("[Prime2Notion] image candidates", { count: images.length, packshot });
    return { images: images.filter(isValidImage), packshot };
}

function isValidImage(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    if (lower.includes("transparent")) return false;
    if (lower.includes("sprite")) return false;
    if (lower.includes("pixel")) return false;
    if (lower.includes("spacer")) return false;
    if (lower.includes(".gif") && !lower.includes("og")) return false;
    return true;
}

// Amazonの画像URLからリサイズパラメータを除去して高画質版を取得する
function getHighResUrl(url) {
    if (!url || !url.includes(".media-amazon.com/images/I/")) return url;
    // ._SX300_.jpg のような部分を消して .jpg にする
    // 例: https://.../I/abc._SX300_.jpg -> https://.../I/abc.jpg
    const cleaned = url.replace(/\._[^/]+(?=\.[a-z]+$)/, "");
    return cleaned;
}

// Amazonの宣伝文パターン（よく出る表現）
const AMAZON_PROMOTION_PATTERNS = [
    /【プ?プ?ラ?イ?ド会員なら.*話までお試し見放題】/,
    /【.*話お試し.*】/,
    /プライム会員なら.*話まで.*$/,
    /Prime Videoで.*$/,
];

// Amazon宣伝文が含まれているかチェック
function hasAmazonPromotion(text) {
    if (!text) return false;
    const cleanText = text.trim();
    return AMAZON_PROMOTION_PATTERNS.some(pattern => pattern.test(cleanText));
}

function removeAmazonPromotionText(text) {
    if (!text) return "";
    let cleaned = text;
    for (const pattern of AMAZON_PROMOTION_PATTERNS) {
        cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags), " ");
    }
    return cleaned.replace(/\s+/g, " ").trim();
}

// タイトルの正準化（normalize）
// 表記揺れを行い、、DB重複チェックの精度を向上
function normalizeTitle(rawTitle) {
    if (!rawTitle) return "";
    let title = rawTitle.trim();

    // 1. 連続するスペースを削除
    title = title.replace(/\s+/g, " ");

    // 2. 数字の正準化（全角・半角の統一）
    // 全角数字を半角数字に統一（Unicode: FF10-FF19 -> 30-39）
    title = title.replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    // 3. 括弧を削除（全角・半角）を一括弧に統一
    title = title.replace(/[（）()]/g, "");
    title = title.replace(/[\(\)]/g, "");

    // 4. 末尾のスペースを削除
    title = title.replace(/\s+$/, "");

    // 5. その他の不要なプレフィックスを削除
    title = title.replace(/^Amazon\.co\.jp[:：]\s*/, "");
    title = title.replace(/\s*\|\s*Prime Video$/, "");
    title = title.replace(/\s*を観る$/, "");

    return title.trim();
}

// タイトルのクリーニング（Amazon宣伝文等を除去）
function cleanTitle(rawTitle) {
    if (!rawTitle) return "";
    let title = rawTitle.trim();
    // プレフィックス除去
    title = title.replace(/^Amazon\.co\.jp[:：]\s*/, "");
    // サフィックス除去
    // 先に " | Prime Video" を消す
    title = title.replace(/\s*\|\s*Prime Video$/, "");
    // その後に "を観る" が残っていたら消す
    title = title.replace(/\s*を観る$/, "");
    return title;
}

// 画像のファイルサイズを取得する（HEADリクエスト）
async function getImageSize(url) {
    try {
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok) {
            const length = response.headers.get("Content-Length");
            return length ? parseInt(length, 10) : 0;
        }
    } catch (e) {
        // HEADリクエスト失敗時はサイズ0として扱い処理を続ける
        // "Receiving end does not exist" エラー等に対応
        console.warn("HEAD request failed for", url, "error:", e.message);
    }
    return 0;
}

// URLからASINまたはGTI（Amazon固有の作品ID）を抽出する
function extractAsin(url) {
    if (!url) return "";
    // パターン1: /dp/BXXXXXXXXX 形式
    const dpMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (dpMatch) return dpMatch[1];
    // パターン2: /detail/BXXXXXXXXX 形式
    const detailMatch = url.match(/\/detail\/([A-Z0-9]{10})/);
    if (detailMatch) return detailMatch[1];
    try {
        const urlObj = new URL(url);
        // パターン3: ?asin=BXXXXXXXXX 形式
        const asinParam = urlObj.searchParams.get("asin");
        if (asinParam && /^[A-Z0-9]{10}$/.test(asinParam)) return asinParam;
        // パターン4: ?gti=amzn1.dv.gti.XXXXX 形式（GTIをフォールバックIDとして使用）
        const gti = urlObj.searchParams.get("gti");
        if (gti && gti.startsWith("amzn1.dv.gti.")) return gti;
    } catch (e) {
        // URL解析失敗時は無視
    }
    return "";
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "EXTRACT_PRIME") return;

    const url = location.href;
    const asin = extractAsin(url);

    // 1. Basic Metadata
    const ogTitle = getMeta("og:title");
    const ogDesc = getMeta("og:description");
    const metaTitle = getMeta("title");

    // Amazon宣伝文チェック
    const titleHasPromotion = hasAmazonPromotion(ogTitle) || hasAmazonPromotion(metaTitle);
    const descHasPromotion = hasAmazonPromotion(ogDesc);

    // DOM上の作品名要素（data-automation-id="title" が最も信頼性が高い）
    const domTitle = tryDomText([
        "h1[data-automation-id='title']",
        "[data-testid='title']",
        ".dv-node-dp-title h1",
        "h1"
    ]);

    const domDesc = tryDomText([
        "[data-automation-id='synopsis']",
        "[data-testid='synopsis']",
        ".dv-node-dp-synopsis",
        ".synopsis",
        "._16S9_p",
        "._1H6ABQ"
    ]);

    // ---------------------------------------------------------
    // 画像候補の収集 (packshot > titleshot > heroshot > covershot の優先順)
    // ---------------------------------------------------------
    const targetImages = extractTargetImages();
    const candidates = [...targetImages.images];
    const packshotUrl = targetImages.packshot; // キービジュアル（最優先）

    // フォールバック: script内に対象画像がなかった場合のみ og:image を使用
    if (candidates.length === 0) {
        const ogImage_ = getMeta("og:image");
        if (ogImage_ && isValidImage(ogImage_)) candidates.push(ogImage_);
    }

    // ---------------------------------------------------------
    // 重複排除、サイズ取得、ソート
    // ---------------------------------------------------------
    (async () => {
        // タイトルの決定とクリーニング
        // DOM要素（data-automation-id="title"等）が最も信頼性が高いため最優先
        // meta titleやdocument.titleにはキャッチコピーが入ることがある
        let rawTitle = domTitle || ogTitle || metaTitle || document.title;
        let finalTitle = cleanTitle(rawTitle);

        // Amazon宣伝文が含まれる場合は自動除去してタイトルに反映
        if (titleHasPromotion) {
            finalTitle = cleanTitle(removeAmazonPromotionText(rawTitle));
        }

        // 正準化タイトル（DB照合用）を生成
        const normalizedTitle = normalizeTitle(rawTitle);

        const uniqueImages = [...new Set(candidates)];

        // 各画像のサイズを取得
        const imageObjects = await Promise.all(
            uniqueImages.map(async (url, index) => {
                const highResUrl = getHighResUrl(url);
                const size = await getImageSize(highResUrl);
                return { url: highResUrl, size, originalIndex: index };
            })
        );

        // 重複排除（高画質化により重複する可能性があるため再度実行）
        const seenUrls = new Set();
        const dedupedImages = imageObjects.filter(item => {
            if (seenUrls.has(item.url)) return false;
            seenUrls.add(item.url);
            return true;
        });

        // ソート: 1. サイズ（大きい順）, 2. 元のインデックス（早い順）
        dedupedImages.sort((a, b) => {
            if (b.size !== a.size) return b.size - a.size;
            return a.originalIndex - b.originalIndex;
        });

        let finalImages = dedupedImages.map(img => img.url).slice(0, 30);

        // packshot（キービジュアル）があれば先頭に配置
        // サイズ取得の成否に関わらず、packshotを最優先にする
        if (packshotUrl) {
            finalImages = finalImages.filter(url => url !== packshotUrl);
            finalImages.unshift(packshotUrl);
        }

        const image = finalImages.length > 0 ? finalImages[0] : "";

        // 監督名・公開年の抽出（LD-JSON）
        let director = "";
        let releaseYear = "";
        try {
            const ldJsons = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of ldJsons) {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data.director && !director) {
                        if (typeof data.director === 'string') director = data.director;
                        else if (data.director.name) director = data.director.name;
                        else if (Array.isArray(data.director)) {
                            // オジェクト配列の場合は名前を結合（対応追加）
                            director = data.director.map(d => typeof d === 'string' ? d : (d?.name || d)).filter(Boolean).join(", ");
                        }
                    }
                    // 公開日から年を抽出
                    if (!releaseYear) {
                        const dateStr = data.datePublished || data.dateCreated || data.releasedEvent?.startDate || "";
                        const yearMatch = dateStr.match(/(\d{4})/);
                        if (yearMatch) releaseYear = yearMatch[1];
                    }
                } catch (e) { }
            }

            // DOM上のラベルから監督名・公開年を抽出
            if (!director || !releaseYear) {
                const labelSelectors = ["._1H6ABQ", "._36v9Yk", "dt", "th"];
                for (const sel of labelSelectors) {
                    const labels = document.querySelectorAll(sel);
                    for (const label of labels) {
                        const txt = label.textContent?.trim();
                        if (!director && txt && (txt.includes("監督") || txt.includes("演出") || txt.includes("Director"))) {
                            const val = label.nextElementSibling?.textContent?.trim();
                            if (val) director = val;
                        }
                        if (!releaseYear && txt && (txt.includes("公開") || txt.includes("初公開日") || txt.includes("Release"))) {
                            const val = label.nextElementSibling?.textContent?.trim();
                            if (val) {
                                const ym = val.match(/(\d{4})/);
                                if (ym) releaseYear = ym[1];
                            }
                        }
                    }
                }
            }

            // script内のreleaseYearフィールドからも取得を試みる
            if (!releaseYear) {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const content = script.textContent;
                    if (!content || content.length < 100) continue;
                    const yrMatch = content.match(/"releaseYear"\s*:\s*(\d{4})/);
                    if (yrMatch) {
                        releaseYear = yrMatch[1];
                        break;
                    }
                }
            }
        } catch (e) { console.error("Metadata extraction error", e); }

        sendResponse({
            title: finalTitle,
            description: pickLongest(ogDesc, getMeta("description"), domDesc),
            director: director,
            releaseYear: releaseYear,
            asin: asin,
            url,
            image,
            images: finalImages,
            watched: true,
            hasPromotion: titleHasPromotion || descHasPromotion,
            normalizedTitle: normalizedTitle
        });
    })();

    return true; // 非同期レスポンスのために true を返す
});
