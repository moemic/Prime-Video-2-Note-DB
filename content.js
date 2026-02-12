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

// JSONデータからtitleshot・packshot・heroshotのみを抽出する
// covershot（エピソードサムネイル）やその他の画像は対象外
function extractTargetImages() {
    const images = [];
    let packshot = "";
    try {
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (!content || content.length < 100) return;

            // titleshot（タイトル画像）
            if (content.includes('titleshot')) {
                const matches = content.match(/"titleshot"\s*:\s*"(https?:\/\/[^"]+)"/g);
                if (matches) {
                    matches.forEach(m => {
                        const url = m.match(/https?:\/\/[^"]+/);
                        if (url && isValidImage(url[0])) {
                            images.push(url[0]);
                        }
                    });
                }
            }

            // packshot（キービジュアル）- 最優先
            if (content.includes('packshot')) {
                const matches = content.match(/"packshot"\s*:\s*"(https?:\/\/[^"]+)"/g);
                if (matches) {
                    matches.forEach(m => {
                        const url = m.match(/https?:\/\/[^"]+/);
                        if (url && isValidImage(url[0])) {
                            if (!packshot) packshot = url[0];
                            images.push(url[0]);
                        }
                    });
                }
            }

            // heroshot（バナー画像）
            if (content.includes('heroshot')) {
                const matches = content.match(/"heroshot"\s*:\s*"(https?:\/\/[^"]+)"/g);
                if (matches) {
                    matches.forEach(m => {
                        const url = m.match(/https?:\/\/[^"]+/);
                        if (url && isValidImage(url[0])) {
                            images.push(url[0]);
                        }
                    });
                }
            }
        });
    } catch (e) {
        console.error("Image extraction error", e);
    }
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

// タイトルのクリーニング
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
        // console.error("HEAD request failed for", url, e);
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
    const title = getMeta("title");

    const domTitle = tryDomText([
        "h1[data-automation-id='title']",
        "h1",
        "[data-testid='title']",
        ".dv-node-dp-title h1",
        "._2I63_X"
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
    // 画像候補の収集 (titleshot / packshot / heroshot のみ)
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
        let rawTitle = pickLongest(ogTitle, domTitle, title);
        if (!rawTitle) rawTitle = document.title;
        const finalTitle = cleanTitle(rawTitle);

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

        // 監督名の抽出（既存ロジック）
        let director = "";
        try {
            const ldJsons = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of ldJsons) {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data.director) {
                        if (typeof data.director === 'string') director = data.director;
                        else if (data.director.name) director = data.director.name;
                        else if (Array.isArray(data.director)) {
                            director = data.director.map(d => typeof d === 'string' ? d : d.name).filter(Boolean).join(", ");
                        }
                    }
                    if (director) break;
                } catch (e) { }
            }

            if (!director) {
                const labelSelectors = ["._1H6ABQ", "._36v9Yk", "dt", "th"];
                for (const sel of labelSelectors) {
                    const labels = document.querySelectorAll(sel);
                    for (const label of labels) {
                        const txt = label.textContent?.trim();
                        if (txt && (txt.includes("監督") || txt.includes("演出") || txt.includes("Director"))) {
                            const val = label.nextElementSibling?.textContent?.trim();
                            if (val) {
                                director = val;
                                break;
                            }
                        }
                    }
                    if (director) break;
                }
            }
        } catch (e) { console.error("Director extraction error", e); }

        sendResponse({
            title: finalTitle,
            description: pickLongest(ogDesc, getMeta("description"), domDesc),
            director: director,
            asin: asin,
            url,
            image,
            images: finalImages,
            watched: true
        });
    })();

    return true; // 非同期レスポンスのために true を返す
});
