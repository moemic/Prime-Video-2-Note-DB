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
    try {
        const script = document.getElementById("dv-web-store-template");
        if (!script) return "";
        return "";
    } catch (e) {
        console.error("JSON Parse Error", e);
        return "";
    }
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
        "._16S9_p"
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

    // E. JSON from LD-JSON
    try {
        const ldJson = document.querySelector('script[type="application/ld+json"]');
        if (ldJson) {
            const data = JSON.parse(ldJson.textContent);
            if (data.image) {
                if (typeof data.image === 'string') candidates.push(data.image);
                else if (data.image.url) candidates.push(data.image.url);
            }
        }
    } catch (e) { }

    // ---------------------------------------------------------
    // 重複排除とソート
    // ---------------------------------------------------------
    const uniqueImages = [...new Set(candidates)];

    // ソート戦略:
    // 1. 横長（ランドスケープ）を優先したいが、URLだけでは判定不可なものもある。
    //    しかし、Visual Extractionで順序良く入っているはずなので、極力元の順序を維持しつつ、
    //    明らかに「poster」っぽいファイル名より「hero」っぽいものがあれば...といったヒューリスティックは難しい。
    //    単純に全部返すのがベスト。ユーザーが選ぶのだから。

    const finalImages = uniqueImages.slice(0, 30); // 多すぎるとUIが重くなるので制限
    const image = finalImages.length > 0 ? finalImages[0] : "";

    // タイトルの決定とクリーニング
    let rawTitle = pickLongest(ogTitle, domTitle, title);
    if (!rawTitle) rawTitle = document.title;
    const finalTitle = cleanTitle(rawTitle);

    sendResponse({
        title: finalTitle,
        description: pickLongest(ogDesc, getMeta("description"), domDesc),
        url,
        image,
        images: finalImages,
        watched: true
    });
});
