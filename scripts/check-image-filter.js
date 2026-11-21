const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function pixels(band = 0, shade = 0, topOnly = false) {
    const data = new Uint8ClampedArray(320 * 180 * 4);
    for (let y = 0; y < 180; y++) {
        for (let x = 0; x < 320; x++) {
            const i = (y * 320 + x) * 4;
            const value = y < band || (!topOnly && y >= 180 - band) ? shade : 140;
            data.set([value, value, value, 255], i);
        }
    }
    return data;
}

async function main() {
    let width = 1920, height = 1080, data = pixels(), fail = false, closed = 0, requests = 0;
    const background = {
        URL, AbortSignal, console: { warn() {} },
        fetch: async () => {
            requests++;
            return { ok: !fail, status: 404, blob: async () => ({ size: 123 }) };
        },
        createImageBitmap: async () => ({ width, height, close() { closed++; } }),
        OffscreenCanvas: class {
            getContext() { return { drawImage() {}, getImageData() { return { data }; } }; }
        }
    };
    vm.createContext(background);
    const source = read('background.js');
    vm.runInContext(source.slice(source.indexOf('// ponytail: 縮小画素'), source.indexOf('chrome.runtime.onMessage.addListener')), background);
    const url = 'https://m.media-amazon.com/images/I/normal.jpg';
    const inspect = () => background.inspectPrimeImage(url);
    assert.equal((await inspect()).usable, true, '通常16:9を残す');
    width = 1918;
    assert.equal((await inspect()).usable, true, 'わずかな丸め誤差を許容');
    width = 1000; height = 1500;
    const posterInspection = await inspect();
    assert.equal(posterInspection.usable, true, '縦長ポスターを残す');
    assert.equal(posterInspection.portrait, true, '縦長属性を返す');
    width = 2400; height = 1000;
    assert.equal((await inspect()).usable, false, '超横長を除外');
    width = 1920; height = 1080;
    data = pixels(20);
    assert.equal((await inspect()).usable, false, '16:9内の黒帯を除外');
    data = pixels(2, 20);
    assert.equal((await inspect()).usable, false, '薄い近黒色帯を除外');
    data = pixels(20, 0, true);
    assert.equal((await inspect()).usable, true, '上だけ暗い画像を黒帯とみなさない');
    data = pixels();
    for (let y of [0, 1, 178, 179]) {
        for (let x = 0; x < 280; x++) data.set([0, 0, 0, 255], (y * 320 + x) * 4);
    }
    assert.equal((await inspect()).usable, true, '横断しない暗部を残す');
    fail = true;
    assert.equal((await inspect()).usable, false, '取得失敗を除外');
    fail = false;
    const before = requests;
    for (const bad of ['http://m.media-amazon.com/images/I/a.jpg', 'https://example.com/images/I/a.jpg',
        'https://m.media-amazon.com.evil.test/images/I/a.jpg', 'https://m.media-amazon.com/private', 'invalid']) {
        assert.equal((await background.inspectPrimeImage(bad)).usable, false);
    }
    assert.equal(requests, before, '不正URLへリクエストしない');
    assert.equal(closed, 8, 'デコードした画像を解放');
    const primeImage = 'https://m.media-amazon.com/images/S/pv-target-images/db7ce6d768c513ff9d634f38f9a6dd3319771e5755ddf00a8437973438527af1.jpg';
    data = pixels();
    assert.equal((await background.inspectPrimeImage(primeImage)).usable, true, '実Prime Video画像パスを許可');
    assert.equal(requests, before + 1, '実Prime画像は取得まで到達する');
    background.createImageBitmap = async () => { throw new Error('decode'); };
    assert.equal((await inspect()).usable, false, 'デコード失敗を除外');

    // 実際のEXTRACT_PRIME応答まで通し、packshot再追加とOGPの迂回を防ぐ。
    const base = 'https://m.media-amazon.com/images/S/pv-target-images/';
    const normal = base + 'normal.jpg', barred = base + 'barred.jpg', poster = base + 'poster.jpg';
    let listener, script = '', og = '', rejected = new Set(), inspections = [];
    const content = {
        URL, console: { debug() {}, warn() {}, error() {} }, setTimeout() {},
        location: { href: 'https://www.amazon.co.jp/dp/B012345678' },
        history: { pushState() {}, replaceState() {} }, window: { addEventListener() {} },
        document: {
            title: '作品タイトル',
            querySelector(selector) {
                if (selector === 'meta[property="og:image"]') return { content: og };
                if (selector === "h1[data-automation-id='title']") return { textContent: '作品タイトル' };
                return null;
            },
            querySelectorAll(selector) { return selector === 'script' ? [{ textContent: script }] : []; }
        },
        chrome: { runtime: {
            onMessage: { addListener(fn) { listener = fn; } },
            async sendMessage(msg) {
                inspections.push(msg.url);
                return { usable: !rejected.has(msg.url), portrait: msg.url === poster,
                    size: msg.url === poster ? 99999 : msg.url === barred ? 9999 : 100 };
            }
        } }
    };
    vm.createContext(content);
    vm.runInContext(read('content.js'), content);
    assert.equal(content.getHighResUrl('https://m.media-amazon.com/images/I/normal._SX300_.jpg'),
        'https://m.media-amazon.com/images/I/normal.jpg', '従来画像の高画質URL変換を維持');
    assert.equal(content.getHighResUrl('https://images-fe.ssl-images-amazon.com/images/S/pv-target-images/normal.jpg'), normal, '実ページの旧CDNを検査可能な現行CDNへ揃える');
    const extract = () => new Promise(resolve => listener({ type: 'EXTRACT_PRIME' }, {}, resolve));
    script = JSON.stringify({ asin: 'B012345678', packshot: barred, titleshot: normal,
        heroshot: normal.replace('m.media-amazon.com', 'images-fe.ssl-images-amazon.com') });
    rejected = new Set([barred]);
    let result = await extract();
    assert.deepEqual(Array.from(result.images), [normal], '黒帯packshotを再追加しない');
    assert.equal(result.image, normal);
    assert.equal(inspections.filter(u => u === normal).length, 1, '同じURLは一度だけ検査');
    rejected = new Set();
    result = await extract();
    assert.equal(result.image, barred, '合格packshotは先頭');
    script = JSON.stringify({ asin: 'B012345678', packshot: poster, titleshot: normal,
        heroshot: barred });
    result = await extract();
    assert.deepEqual(Array.from(result.images), [barred, normal, poster], '大きい縦長packshotより全横長を優先');
    assert.equal(result.image, barred, '先頭は横長');
    rejected = new Set([barred]);
    result = await extract();
    assert.deepEqual(Array.from(result.images), [normal, poster], '黒帯除外とポスター保持を両立');
    script = ''; og = poster;
    result = await extract();
    assert.deepEqual(Array.from(result.images), [poster], 'ポスターだけの場合も候補を保持');
    script = ''; og = barred; rejected = new Set([barred]);
    result = await extract();
    assert.equal(result.images.length, 0, 'OGPも除外条件を適用');
    assert.equal(result.image, '', '全除外時に画像を捏造しない');
    og = normal;
    result = await extract();
    assert.equal(result.image, normal, '合格OGPを残す');
    let popupListener, handled = 0, changed = 0;
    const popup = { chrome: { runtime: { onMessage: { addListener(fn) { popupListener = fn; } } } },
        scheduleAutoExtractFromPageChange() { changed++; }, handleExtractedMessage() { handled++; } };
    vm.createContext(popup);
    const popupSource = read('popup.js');
    vm.runInContext(popupSource.slice(popupSource.indexOf('// メッセージリスナー\n'),
        popupSource.indexOf('function scheduleAutoExtractFromPageChange')), popup);
    popupListener({ type: 'INSPECT_PRIME_IMAGE', url: normal });
    popupListener({ type: 'GET_NOTION_STATUS_OPTIONS' });
    assert.equal(handled, 0, '内部要求で作品・画像状態を上書きしない');
    popupListener({ type: 'PRIME_PAGE_CHANGED', url: 'https://www.primevideo.com/detail/new' });
    assert.equal(changed, 1, '作品変更通知は維持');
    popupListener({ title: '作品タイトル', images: [normal] });
    assert.equal(handled, 1, '抽出結果の処理は維持');
    console.log('画像フィルタチェックOK: 比率・黒帯・失敗・URL制限・packshot・OGP・重複排除');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
