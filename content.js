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

function tryDomImage(selectors) {
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;

        const srcset = el.getAttribute("srcset");
        if (srcset) {
            const parts = srcset.split(",").map(s => s.trim().split(" ")[0]);
            return parts[parts.length - 1];
        }

        const src = el.getAttribute("src") || el.getAttribute("data-src") || "";
        if (src && src.startsWith("http")) return src;
    }
    return "";
}

// JSONデータから高画質画像を抽出する（最強ロジック）
function tryJsonMetadata() {
    const images = [];
    try {
        // 1. LD-JSONから取得
        const ldJsons = document.querySelectorAll('script[type="application/ld+json"]');
        ldJsons.forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                if (data.image) {
                    if (typeof data.image === 'string') images.push(data.image);
                    else if (data.image.url) images.push(data.image.url);
                    else if (Array.isArray(data.image)) images.push(...data.image);
                }
            } catch (e) { }
        });

        // 2. dv-web-store-template (Amazon特有のデータ) から取得
        const storeTemplate = document.getElementById("dv-web-store-template");
        if (storeTemplate) {
            const matches = storeTemplate.textContent.match(/https?:\/\/[^"']+\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-\._\+]+(?:\.jpg|\.png)/g);
            if (matches) images.push(...matches);
        }

        // 3. 他のscript内のJSONライクな構造からpackshotを探す
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (content && content.includes('packshot')) {
                const packshotMatches = content.match(/"packshot"\s*:\s*"(https?:\/\/[^"]+)"/g);
                if (packshotMatches) {
                    packshotMatches.forEach(m => {
                        const url = m.match(/https?:\/\/[^"]+/);
                        if (url) images.push(url[0]);
                    });
                }
            }
        });
    } catch (e) {
        console.error("JSON Parse Error", e);
    }
    return images.filter(isValidImage);
}

// 背景画像を抽出する（グラデーション対応）
function tryBackgroundImage(selectors) {
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) {
            continue;
        }

        const style = window.getComputedStyle(el);
        const bg = style.backgroundImage;

        if (bg && bg.includes('url(')) {
            const matches = bg.match(/url\(["']?(https?:\/\/[^"']+)["']?\)/);
            if (matches && matches[1]) {
                return matches[1];
            }
        }
    }
    return "";
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "EXTRACT_PRIME") return;

    const url = location.href;

    // 1. Basic Metadata
    const ogImage = getMeta("og:image");
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
    // 画像候補の収集 (All Candidates Strategy)
    // ---------------------------------------------------------
    const candidates = [];

    // A. Visual Extraction (画面上の有力な画像をすべて取得)
    try {
        // imgタグ
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
            const rect = img.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0 || img.style.display === 'none' || img.style.visibility === 'hidden') continue;

            const area = rect.width * rect.height;
            // 極端に小さい画像は無視 (アイコン等)
            if (area > 5000) {
                const src = img.currentSrc || img.src;
                if (src && isValidImage(src)) candidates.push(src);
            }
        }

        // 背景画像
        const bgCandidates = document.querySelectorAll('div, section, header, a, span');
        for (const el of bgCandidates) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            const area = rect.width * rect.height;
            if (area < 10000) continue;

            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage;

            if (bg && bg.includes('url(')) {
                const matches = bg.match(/url\(["']?(https?:\/\/[^"']+)["']?\)/);
                if (matches && matches[1] && isValidImage(matches[1])) {
                    candidates.push(matches[1]);
                }
            }
        }
    } catch (e) { console.error("Visual extraction error", e); }

    // B. Resource Timing API
    try {
        const resources = performance.getEntriesByType("resource");
        const amazonImages = resources
            .filter(r => r.initiatorType === 'img' || r.name.match(/\.(jpg|png|webp)(\?.*)?$/i))
            .map(r => r.name)
            .filter(url =>
                url.match(/https?:\/\/(?:images-na\.ssl-images-amazon\.com|m\.media-amazon\.com)\/images\/I\/[a-zA-Z0-9\-\._\+]+(?:\.jpg|\.png)/) &&
                isValidImage(url)
            );
        candidates.push(...amazonImages);
    } catch (e) {
        console.error("Resource Timing error", e);
    }

    // C. Script Regex (Hidden high-res images)
    try {
        const scripts = document.querySelectorAll('script');
        // 優先度が高い画像の正規表現 (packshot, heroなど)
        const priorityRegex = /(?:packshot|hero|cover|image|landingPage)[^}]+?https?:\\?\/\\?\/[^"']+\.media-amazon\.com\\?\/images\\?\/I\\?\/[a-zA-Z0-9\-\._\+]+(?:\.jpg|\.png)/gi;

        for (const script of scripts) {
            const content = script.textContent;
            if (!content || content.length < 100) continue;

            const matches = content.match(priorityRegex);
            if (matches) {
                for (const m of matches) {
                    const urlMatch = m.match(/https?:\\?\/\\?\/[^"']+\.media-amazon\.com\\?\/images\\?\/I\\?\/[a-zA-Z0-9\-\._\+]+(?:\.jpg|\.png)/);
                    if (urlMatch) {
                        const rawUrl = urlMatch[0].replace(/\\/g, "");
                        if (isValidImage(rawUrl)) candidates.push(rawUrl);
                    }
                }
            }
        }
    } catch (e) { console.error("Script regex error", e); }

    // D. Metadata & JSON
    if (isValidImage(ogImage)) candidates.push(ogImage);
    const jsonImages = tryJsonMetadata();
    candidates.push(...jsonImages);

    // ---------------------------------------------------------
    // 重複排除と高画質化
    // ---------------------------------------------------------
    const uniqueImages = [...new Set(candidates)];
    const highResImages = uniqueImages.map(getHighResUrl);
    const finalImages = [...new Set(highResImages)].slice(0, 30);
    const image = finalImages.length > 0 ? finalImages[0] : "";

    // タイトルの決定とクリーニング
    let rawTitle = pickLongest(ogTitle, domTitle, title);
    if (!rawTitle) rawTitle = document.title;
    const finalTitle = cleanTitle(rawTitle);

    // 監督名の抽出
    let director = "";
    try {
        // LD-JSONから探す
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

        // DOMから探す（「監督」「演出」ラベル等）
        if (!director) {
            const labelSelectors = [
                "._1H6ABQ", // Amazon Details Label
                "._36v9Yk",
                "dt",
                "th"
            ];
            for (const sel of labelSelectors) {
                const labels = document.querySelectorAll(sel);
                for (const label of labels) {
                    const txt = label.textContent?.trim();
                    if (txt && (txt.includes("監督") || txt.includes("演出") || txt.includes("Director"))) {
                        // 次の要素または親の兄弟等から値を取得
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
        url,
        image,
        images: finalImages,
        watched: true
    });
});
