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

function normalizeImageHint(value) {
    return (value || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/^amazon\.co\.jp[:：]\s*/, "")
        .replace(/\s*\|\s*prime video$/, "")
        .replace(/\s*を観る$/, "")
        .replace(/\s+/g, " ");
}

function buildImageContextHints({ asin, url, domTitle, ogTitle, metaTitle }) {
    const hints = new Set();
    const push = (value) => {
        const normalized = normalizeImageHint(value);
        if (normalized && normalized.length >= 4) hints.add(normalized);
    };

    push(asin);
    push(domTitle);
    push(ogTitle);
    push(metaTitle);

    try {
        const urlObj = new URL(url);
        push(urlObj.searchParams.get("asin"));
        push(urlObj.searchParams.get("gti"));
        urlObj.pathname.split("/").forEach(part => push(part));
    } catch (e) {
        // URL解析失敗時は他のヒントだけで判定する
    }

    return [...hints];
}

// JSONデータからtitleshot・packshot・heroshot・covershotを抽出する
// covershot（エピソードサムネイル）は最低優先度で追加
function extractTargetImages(contextHints = []) {
    const matchedImages = [];
    const fallbackImages = [];
    let matchedPackshot = "";
    let fallbackPackshot = "";
    const normalizedHints = contextHints.map(normalizeImageHint).filter(Boolean);
    try {
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (!content || content.length < 100) return;
            const normalizedContent = content.toLowerCase();
            const matchesCurrentContext = normalizedHints.some(hint => normalizedContent.includes(hint));
            const targetImages = matchesCurrentContext ? matchedImages : fallbackImages;

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
                        targetImages.push(normalized);
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
                        targetImages.push(url);
                    }
                }
            };

            // titleshot（タイトル画像）
            if (content.includes('titleshot')) pushByKey("titleshot");

            // packshot（キービジュアル）- 最優先
            if (content.includes('packshot')) {
                pushByKey("packshot", (url) => {
                    if (matchesCurrentContext) {
                        if (!matchedPackshot) matchedPackshot = url;
                    } else if (!fallbackPackshot) {
                        fallbackPackshot = url;
                    }
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
    const useMatchedImages = matchedImages.length > 0;
    const images = useMatchedImages ? matchedImages : fallbackImages;
    const packshot = useMatchedImages ? matchedPackshot : fallbackPackshot;
    console.debug("[Prime2Notion] image candidates", {
        count: images.length,
        matchedCount: matchedImages.length,
        fallbackCount: fallbackImages.length,
        matched: useMatchedImages,
        packshot
    });
    return { images: images.filter(isValidImage), packshot, matched: useMatchedImages };
}

function isValidImage(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    if (lower.includes("transparent")) return false;
    if (lower.includes("sprite")) return false;
    if (lower.includes("pixel")) return false;
    if (lower.includes("spacer")) return false;
    if (lower.includes("logo")) return false;
    if (lower.includes("prime-logo")) return false;
    if (lower.includes("primevideo")) return false;
    if (lower.includes("prime-video")) return false;
    if (lower.includes("campaign")) return false;
    if (lower.includes("promotion")) return false;
    if (lower.includes("free-trial")) return false;
    if (lower.includes(".gif") && !lower.includes("og")) return false;
    return true;
}

// Amazonの画像URLからリサイズパラメータを除去して高画質版を取得する
function getHighResUrl(url) {
    // Prime Videoの旧CDNも同じ画像を配信する現行CDNへ揃える
    url = url?.replace(/^https:\/\/images-fe\.ssl-images-amazon\.com\//, "https://m.media-amazon.com/");
    if (!url || !url.includes(".media-amazon.com/images/I/")) return url;
    // ._SX300_.jpg のような部分を消して .jpg にする
    // 例: https://.../I/abc._SX300_.jpg -> https://.../I/abc.jpg
    const cleaned = url.replace(/\._[^/]+(?=\.[a-z]+$)/, "");
    return cleaned;
}

// Amazonの宣伝文パターン（よく出る表現）
const AMAZON_PROMOTION_PATTERNS = [
    /【プライム会員なら[^【】]*】/,
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
    // 宣伝文を含む括弧だけを先に除去し、作品名の括弧は残す
    let cleaned = text.replace(/【[^【】]*】|（[^（）]*）|\([^()]*\)|「[^「」]*」|\[[^\[\]]*\]/g,
        block => hasAmazonPromotion(block) ? " " : block);
    for (const pattern of AMAZON_PROMOTION_PATTERNS) {
        cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags), " ");
    }
    return cleaned.replace(/\s+/g, " ").trim();
}

const TITLE_PROVIDER_NAMES = ["TBSオンデマンド", "dアニストア"];

function removeTitleProviderTags(title) {
    let cleaned = title;
    cleaned = cleaned.replace(/【\s*[^【】]{1,40}オンデマンド\s*】/gi, " ");
    for (const provider of TITLE_PROVIDER_NAMES) {
        const escaped = provider.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        cleaned = cleaned.replace(new RegExp(`(?:【\\s*${escaped}\\s*】|[（(]\\s*${escaped}\\s*[）)])`, "gi"), " ");
    }
    return cleaned;
}

function extractPrimeCategories(...descriptions) {
    const categories = new Set();
    const isMetadata = text => /^(?:IMDb\s*)?\d+(?:\.\d+)?\s*\/\s*\d+$/i.test(text)
        || /^\d{4}$/.test(text)
        || /^\d+\s*シーズン$/.test(text)
        || /^\d+\s*(?:時間|分)$/.test(text)
        || /^[•·]$/.test(text);
    const add = value => {
        const text = String(value || "").replace(/\\u0026/g, "&").replace(/\s+/g, " ").trim();
        if (!text || text.length > 40 || /^https?:/i.test(text) || isMetadata(text)) return;
        if (/^(genre|genres|category|categories)$/i.test(text)) return;
        categories.add(text);
    };

    const detailRoot = document.querySelector(".dv-node-dp-genres.jRnQrN, .dv-node-dp-genres, .prVTDY");

    if (detailRoot) {
        detailRoot.querySelectorAll("a, span, strong, b").forEach(element => {
            if (element.children.length > 0) return;
            const text = element.textContent?.trim() || "";
            add(text);
        });
        if (/[•·]/.test(detailRoot.textContent || "")) {
            detailRoot.textContent.split(/[•·]/).forEach(add);
        }
    } else {
        document.querySelectorAll([
            "[data-automation-id='genres'] a",
            "[data-testid='genres'] a",
            "a[href*='/genre/']",
            "a[href*='genres=']"
        ].join(",")).forEach(element => add(element.textContent));
    }

    for (const description of descriptions) {
        const prefix = description?.trimStart().match(/^(?:\[[^\[\]\n]+\]\s*)+/)?.[0] || "";
        for (const [, group] of prefix.matchAll(/\[([^\]]+)\]/g)) {
            const labels = group.split(/[/／]/).map(label => label.trim());
            if (labels.length > 1 && labels.every(label => /^[\p{L}\p{M}ー・]{1,40}$/u.test(label))) {
                labels.forEach(add);
            }
        }
    }
    return [...categories];
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

    return cleanTitle(title);
}

// タイトルのクリーニング（Amazon宣伝文等を除去）
function cleanTitle(rawTitle) {
    if (!rawTitle) return "";
    let title = removeAmazonPromotionText(rawTitle);
    // プレフィックス除去
    title = title.replace(/^Amazon\.co\.jp[:：]\s*/, "");
    // 作品名に混ざる既知の配信元タグだけを除去
    title = removeTitleProviderTags(title);
    // Prime Videoの仕様変更で付加される視聴案内を末尾だけから除去
    title = title.replace(/\s*を(?:オンラインで)?(?:視聴|観る)\s*(?:[-–—|]\s*Prime Video)?\s*$/, "");
    // 視聴案内がない従来形式のPrime Video表記も除去
    title = title.replace(/\s*[-–—|]\s*Prime Video\s*$/, "");
    // シーズン情報の直前にだけ付く不自然な「の」を除去
    title = title.replace(/の(?=シーズン\s*[0-9０-９]+\s*$)/, " ");
    return title.replace(/\s+/g, " ").trim();
}

// 画像のファイルサイズを取得する代わりに、拡張側で比率・黒帯も検査する
async function getImageInspection(url) {
    try {
        return await chrome.runtime.sendMessage({ type: "INSPECT_PRIME_IMAGE", url }) || { usable: false, size: 0 };
    } catch (error) {
        console.warn("画像検査を実行できません:", error.message);
        return { usable: false, size: 0 };
    }
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

    const metaDescription = getMeta("description");
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
    const imageContextHints = buildImageContextHints({ asin, url, domTitle, ogTitle, metaTitle });
    const targetImages = extractTargetImages(imageContextHints);
    const candidates = [...targetImages.images];
    const packshotUrl = targetImages.packshot; // キービジュアル（最優先）

    // SPA遷移後に古いscript画像しか取れない場合は、現在ページのOGP画像を優先する
    const ogImage_ = getMeta("og:image");
    if (!targetImages.matched && ogImage_ && isValidImage(ogImage_)) {
        candidates.length = 0;
        candidates.push(ogImage_);
    } else if (candidates.length === 0 && ogImage_ && isValidImage(ogImage_)) {
        candidates.push(ogImage_);
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
        const normalizedTitle = normalizeTitle(finalTitle);

        const uniqueImages = [...new Set(candidates.map(getHighResUrl))];

        // 同時ダウンロードは4枚までに抑え、合格画像だけを残す
        const imageObjects = [];
        for (let offset = 0; offset < uniqueImages.length; offset += 4) {
            const batch = await Promise.all(uniqueImages.slice(offset, offset + 4).map(async (url, index) => {
                const inspection = await getImageInspection(url);
                return { url, ...inspection, originalIndex: offset + index };
            }));
            imageObjects.push(...batch.filter(item => item.usable));
        }

        // ソート: 横長を優先し、各グループ内はサイズ・元の順番で並べる
        imageObjects.sort((a, b) => {
            if (Boolean(a.portrait) !== Boolean(b.portrait)) return a.portrait ? 1 : -1;
            if (b.size !== a.size) return b.size - a.size;
            return a.originalIndex - b.originalIndex;
        });

        let finalImages = imageObjects.map(img => img.url).slice(0, 30);

        // 横長packshotだけを先頭に優先し、縦長ポスターは後ろに残す
        const preferredPackshot = getHighResUrl(packshotUrl);
        if (imageObjects.some(item => item.url === preferredPackshot && !item.portrait)) {
            finalImages = [preferredPackshot, ...finalImages.filter(url => url !== preferredPackshot)].slice(0, 30);
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
            description: pickLongest(ogDesc, metaDescription, domDesc),
            director: director,
            releaseYear: releaseYear,
            categories: extractPrimeCategories(domDesc, ogDesc, metaDescription),
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

let lastPrimeLocation = location.href;

function notifyPrimeLocationChanged() {
    if (location.href === lastPrimeLocation) return;
    lastPrimeLocation = location.href;
    chrome.runtime.sendMessage({
        type: "PRIME_PAGE_CHANGED",
        url: location.href
    }).catch(() => undefined);
}

["pushState", "replaceState"].forEach(methodName => {
    const original = history[methodName];
    history[methodName] = function (...args) {
        const result = original.apply(this, args);
        setTimeout(notifyPrimeLocationChanged, 100);
        return result;
    };
});

window.addEventListener("popstate", () => {
    setTimeout(notifyPrimeLocationChanged, 100);
});
