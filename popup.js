// DOM要素
// DOM Elements
const titleEl = document.getElementById("title");
const noteEl = document.getElementById("note");
const commentEl = document.getElementById("comment");
const tagInput = document.getElementById("tagInput");
const tagsContainer = document.getElementById("tagsContainer");
const ratingStars = document.getElementById("ratingStars");

// Carousel Elements
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const carouselTrack = document.getElementById("carouselTrack");
const counterEl = document.getElementById("imgCounter");
const suggestedTagsContainer = document.getElementById("suggestedTags");
const statusInput = document.getElementById("statusInput");
const statusContainer = document.getElementById("statusContainer");
const suggestedStatusesContainer = document.getElementById("suggestedStatuses");


const statusEl = document.getElementById("status");
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const tokenEl = document.getElementById("token");
const dbEl = document.getElementById("db");
const saveBtn = document.getElementById("saveBtn"); // 明示的に取得
const duplicateWarning = document.getElementById("duplicateWarning");
const duplicateLink = document.getElementById("duplicateLink");
const overwriteCoverEl = document.getElementById("overwriteCover");

// 状態
const VERSION = "v1.20.0";
let currentRating = 0;
let tags = [];
let currentStatus = ""; // 初期値なし（Notionの選択肢に依存）
let statusOptionsData = []; // ステータス候補保持用
let extractedData = {}; // nullからオブジェクトに変更
let imageCandidates = []; // 新しい状態変数
let currentImageIndex = 0; // selected image (プロパティ用)
let pageCoverIndex = -1; // ページカバー用 (-1 = プロパティ用と同じ)
let slideIndex = 0; // scroll position
let existingPageId = null; // 既存ページID
let currentStatusType = "status"; // Notion側のプロパティ型保持用
let hasCover = false; // 既存カバーの有無
let existingFiles = []; // 既存のファイルリスト
let currentAsin = ""; // 作品固有のASIN
let chipColorMap = {}; // token -> hue

// 初期化
(async () => {
  // 設定を読み込み (localに変更)
  const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);
  const { chipColorMap: storedChipColorMap } = await chrome.storage.local.get(["chipColorMap"]);
  chipColorMap = storedChipColorMap && typeof storedChipColorMap === "object" ? storedChipColorMap : {};

  if (notionToken) tokenEl.value = notionToken;
  if (notionDbId) dbEl.value = notionDbId;

  // 未設定の場合は設定パネルを自動で開いてガイドを表示
  if (!notionToken || !notionDbId) {
    settingsPanel.classList.add("show");
  }

  // 自動保存のリスナーを追加
  tokenEl.addEventListener("input", () => {
    chrome.storage.local.set({ notionToken: tokenEl.value.trim() });
  });

  dbEl.addEventListener("input", () => {
    chrome.storage.local.set({ notionDbId: dbEl.value.trim() });
  });

  // タイトル変更時に重複チェックを再実行
  titleEl.addEventListener("blur", () => {
    if (titleEl.value.trim()) {
      checkDuplicate(titleEl.value.trim());
    }
  });

  // ページからデータを抽出
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const msg = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PRIME" });
      if (msg) {
        // populateForm(extractedData); // populateFormはメッセージリスナーに統合されるため削除
        // メッセージリスナーのロジックを直接呼び出す
        handleExtractedMessage(msg);
      }
    }
  } catch (e) {
    console.error("抽出エラー:", e);
    carouselTrack.innerHTML = '<div style="color:#aaa; padding:10px; font-size:11px;">抽出に失敗しました。ページをリロードして再度お試しください。</div>';
  }

  // 既存タグ・ステータス候補の取得
  fetchNotionTags();
  fetchNotionStatusOptions();
})();

function normalizeTokenKey(token) {
  return String(token || "").trim().toLowerCase();
}

function hashText(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function getUsedHues(exceptKey = "") {
  const used = new Set();
  Object.entries(chipColorMap).forEach(([key, hue]) => {
    if (key === exceptKey) return;
    if (Number.isFinite(hue)) used.add(hue);
  });
  return used;
}

function assignUniqueHue(key) {
  const base = hashText(key) % 360;
  const used = getUsedHues(key);
  if (!used.has(base)) return base;
  for (let delta = 1; delta < 360; delta++) {
    const p = (base + delta) % 360;
    if (!used.has(p)) return p;
    const n = (base - delta + 360) % 360;
    if (!used.has(n)) return n;
  }
  return base;
}

function ensureHue(token) {
  const key = normalizeTokenKey(token);
  if (!key) return 200;
  const existing = chipColorMap[key];
  if (Number.isFinite(existing)) return existing;
  const hue = assignUniqueHue(key);
  chipColorMap[key] = hue;
  chrome.storage.local.set({ chipColorMap }).catch(() => {});
  return hue;
}

function getTokenColors(token) {
  const hue = ensureHue(token);
  return {
    bg: `hsla(${hue}, 70%, 42%, 0.28)`,
    fg: `hsl(${hue}, 88%, 78%)`,
    border: `hsla(${hue}, 72%, 58%, 0.85)`,
    selectedBg: `hsla(${hue}, 78%, 48%, 0.32)`,
    selectedFg: `hsl(${hue}, 92%, 84%)`,
    selectedBorder: `hsla(${hue}, 85%, 64%, 0.95)`,
    solidBg: `hsl(${hue}, 74%, 60%)`,
    solidFg: "#1a1d21",
    solidBorder: `hsla(${hue}, 70%, 40%, 0.95)`
  };
}

function applyChipColor(el, token, mode = "candidate") {
  const c = getTokenColors(token);
  if (mode === "selected") {
    el.style.setProperty("--chip-bg", c.solidBg);
    el.style.setProperty("--chip-fg", c.solidFg);
    el.style.setProperty("--chip-border", c.solidBorder);
    return;
  }
  el.style.setProperty("--chip-bg", c.bg);
  el.style.setProperty("--chip-fg", c.fg);
  el.style.setProperty("--chip-border", c.border);
  el.style.setProperty("--chip-selected-bg", c.selectedBg);
  el.style.setProperty("--chip-selected-fg", c.selectedFg);
  el.style.setProperty("--chip-selected-border", c.selectedBorder);
}

async function checkDuplicate(title) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHECK_DUPLICATE", asin: currentAsin, title });
    if (res?.ok && res.duplicate) {
      existingPageId = res.pageId;
      // チェックボックスを残しつつテキスト部分のみ更新
      const linkEl = duplicateWarning.querySelector("#duplicateLink");
      if (linkEl) {
        linkEl.href = res.url;
      }
      // テキストノードを更新（先頭のテキストのみ）
      const textNode = duplicateWarning.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = "⚠️ すでに登録されています：";
      }

      // 既存データの各フィールドへの反映
      if (res.rating !== undefined) {
        currentRating = res.rating;
        updateStars();
      }
      if (res.tags) {
        tags = res.tags;
        renderTags();
      }
      if (res.description) {
        noteEl.value = res.description;
      }
      if (res.director) {
        extractedData.director = res.director;
      }
      if (res.date) {
        extractedData.date = res.date;
      }
      if (res.status) {
        currentStatus = res.status;
        renderStatus();
      }

      duplicateWarning.style.display = "block";
      hasCover = res.hasCover || false;
      existingFiles = res.existingFiles || [];
    } else {
      existingPageId = null;
      duplicateWarning.style.display = "none";
      hasCover = false;
      existingFiles = [];
    }
  } catch (e) {
    console.error("重複チェックエラー:", e);
    existingPageId = null;
    duplicateWarning.style.display = "none";
  }
}

async function fetchNotionTags() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_NOTION_TAGS" });
    if (res?.ok && res.tags) {
      renderSuggestedTags(res.tags);
    }
  } catch (e) {
    console.error("タグ取得エラー:", e);
  }
}

function renderSuggestedTags(notionTags) {
  suggestedTagsContainer.innerHTML = '';
  notionTags.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    applyChipColor(chip, tag);
    if (tags.includes(tag)) chip.classList.add("selected");
    chip.onclick = () => toggleTagFromChip(tag, chip);
    suggestedTagsContainer.appendChild(chip);
  });
}

function toggleTagFromChip(text, chip) {
  if (tags.includes(text)) {
    removeTag(text);
  } else {
    addTag(text);
  }
}

async function fetchNotionStatusOptions() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_NOTION_STATUS_OPTIONS" });
    if (res?.ok && res.options) {
      currentStatusType = res.type || "status";
      statusOptionsData = res.options;
      renderSuggestedStatuses();
      renderStatus();
    }
  } catch (e) {
    console.error("ステータス候補取得エラー:", e);
  }
}

// ステータス入力欄のイベント
statusInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && statusInput.value.trim()) {
    e.preventDefault();
    setStatus(statusInput.value.trim());
    statusInput.value = "";
  }
});

function setStatus(text) {
  currentStatus = text;
  renderStatus();
  renderSuggestedStatuses();
}

function removeStatus() {
  currentStatus = "";
  renderStatus();
  renderSuggestedStatuses();
}

function renderStatus() {
  // 既存のステータスチップを削除 (input以外)
  statusContainer.querySelectorAll(".tag").forEach(el => el.remove());

  if (currentStatus) {
    const chip = document.createElement("span");
    chip.className = "tag"; // タグと同じスタイルを使用
    chip.innerHTML = `${currentStatus} <span class="remove">×</span>`;
    applyChipColor(chip, currentStatus, "selected");
    chip.querySelector(".remove").addEventListener("click", () => removeStatus());
    statusContainer.insertBefore(chip, statusInput);
  }
}

function renderSuggestedStatuses() {
  suggestedStatusesContainer.innerHTML = '';
  statusOptionsData.forEach(opt => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = opt.name;
    applyChipColor(chip, opt.name);

    // 現在のステータスと一致していれば選択状態にする
    if (currentStatus === opt.name) {
      chip.classList.add("selected");
    }

    chip.onclick = () => {
      if (currentStatus === opt.name) {
        // 解除するか再選択するかだが、単一選択なので他を選ぶまで維持でもいいが、
        // タグのUXに合わせてトグル動作（解除）もできるようにする
        removeStatus();
      } else {
        setStatus(opt.name);
      }
    };
    suggestedStatusesContainer.appendChild(chip);
  });
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((msg) => {
  // 抽出完了メッセージ等のハンドリング
  handleExtractedMessage(msg);
  return true;
});

// データ処理ハンドラ
function handleExtractedMessage(data) {
  if (data.asin) {
    currentAsin = data.asin;
    extractedData.asin = data.asin;
  }
  if (data.title) {
    titleEl.value = data.title;
    extractedData.title = data.title;
    // 重複チェック実行（ASINがあればASIN優先）
    checkDuplicate(data.title);
  }
  if (data.description) {
    noteEl.value = data.description;
    extractedData.description = data.description;
  }
  if (data.director) {
    extractedData.director = data.director;
  }
  if (data.releaseYear) {
    extractedData.releaseYear = data.releaseYear;
  }

  if (data.url) extractedData.url = data.url;
  if (data.watched) extractedData.watched = data.watched;

  // 画像候補リストの処理
  if (data.images && data.images.length > 0) {
    imageCandidates = data.images;
    currentImageIndex = 0;
  } else if (data.image) {
    imageCandidates = [data.image];
    currentImageIndex = 0;
  } else {
    // 画像がない場合でも空配列をセットして表示をクリア
    imageCandidates = [];
  }

  updateCarousel();
}

// Carousel Render & Logic
function updateCarousel() {
  if (imageCandidates.length === 0) {
    carouselTrack.innerHTML = '<div style="color:#aaa; padding:10px;">No Images</div>';
    counterEl.textContent = "0/0";
    return;
  }

  // 1. Render Images (only if needed/first time or full refresh)
  // To avoid flicker, check if track has correct number of children
  if (carouselTrack.childElementCount !== imageCandidates.length) {
    carouselTrack.innerHTML = '';
    imageCandidates.forEach((url, index) => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'carousel-item';
      img.dataset.index = index;
      img.onclick = () => selectImage(index);
      img.oncontextmenu = (e) => {
        e.preventDefault();
        selectPageCover(index);
      };
      carouselTrack.appendChild(img);
    });
  }

  // 2. Update Selection Style
  const items = carouselTrack.querySelectorAll('.carousel-item');
  items.forEach((item, index) => {
    item.classList.remove('selected', 'page-cover');
    if (index === currentImageIndex) {
      item.classList.add('selected');
    }
    if (index === pageCoverIndex) {
      item.classList.add('page-cover');
    }
  });

  // 3. Update Counter and Export Data
  extractedData.image = imageCandidates[currentImageIndex]; // For save
  counterEl.textContent = `${currentImageIndex + 1}/${imageCandidates.length}`;

  // 4. Update Navigation Buttons
  // Auto-scroll logic handles view, buttons can manually slide
  updateSlidePosition();
}

function selectImage(index) {
  currentImageIndex = index;
  updateCarousel();
}

function selectPageCover(index) {
  // 同じ画像を再度右クリックしたら解除（プロパティ用と同じに戻す）
  pageCoverIndex = (pageCoverIndex === index) ? -1 : index;
  updateCarousel();
}

// Slide Logic
const ITEM_WIDTH = 124; // 120px width + 4px gap

function updateSlidePosition() {
  // transform logic if manual sliding is preferred over scrollIntoView
  // mixing both can be tricky. let's stick to transform for buttons
  carouselTrack.style.transform = `translateX(-${slideIndex * ITEM_WIDTH}px)`;

  // Button states
  // prevBtn.disabled = slideIndex <= 0;
  // nextBtn.disabled = slideIndex >= imageCandidates.length - 3; // rough estimate
}

prevBtn.onclick = () => {
  if (slideIndex > 0) {
    slideIndex--;
    updateSlidePosition();
  }
};

nextBtn.onclick = () => {
  // Don't scroll past the end
  if (slideIndex < imageCandidates.length - 1) {
    slideIndex++;
    updateSlidePosition();
  }
};

// Initialize with empty carousel
updateCarousel();

// タグ機能
tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && tagInput.value.trim()) {
    e.preventDefault();
    addTag(tagInput.value.trim());
    tagInput.value = "";
  }
});

function addTag(text) {
  if (tags.includes(text)) return;
  tags.push(text);
  renderTags();
}

function removeTag(text) {
  tags = tags.filter(t => t !== text);
  renderTags();
}

function renderTags() {
  // 既存のタグ要素を削除
  tagsContainer.querySelectorAll(".tag").forEach(el => el.remove());

  // タグを追加
  tags.forEach(tag => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag";
    tagEl.innerHTML = `${tag} <span class="remove">×</span>`;
    applyChipColor(tagEl, tag, "selected");
    tagEl.querySelector(".remove").addEventListener("click", () => removeTag(tag));
    tagsContainer.insertBefore(tagEl, tagInput);
  });

  // チップの選択状態を更新
  const chips = suggestedTagsContainer.querySelectorAll(".tag-chip");
  chips.forEach(chip => {
    chip.classList.toggle("selected", tags.includes(chip.textContent));
  });
}

// レーティング機能
ratingStars.addEventListener("click", (e) => {
  if (e.target.classList.contains("star")) {
    currentRating = parseInt(e.target.dataset.value, 10);
    updateStars();
  }
});

ratingStars.addEventListener("mouseover", (e) => {
  if (e.target.classList.contains("star")) {
    const hoverValue = parseInt(e.target.dataset.value, 10);
    highlightStars(hoverValue);
  }
});

ratingStars.addEventListener("mouseout", () => {
  updateStars();
});

function highlightStars(value) {
  const stars = ratingStars.querySelectorAll(".star");
  stars.forEach((star, i) => {
    star.classList.toggle("active", i < value);
  });
}

function updateStars() {
  highlightStars(currentRating);
}

// 設定パネルのトグル
settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("show");
});

// レーティング値からNotionのセレクト値への変換
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


// 保存
saveBtn.addEventListener("click", async () => {
  statusEl.textContent = "保存中...";
  statusEl.className = "status loading";
  saveBtn.disabled = true;

  const notionToken = tokenEl.value.trim();
  const notionDbId = dbEl.value.trim();

  if (!notionToken || !notionDbId) {
    statusEl.textContent = "TokenとDatabase IDを設定してください";
    statusEl.className = "status error";
    saveBtn.disabled = false;
    settingsPanel.classList.add("show");
    return;
  }

  // 設定を保存 (local)
  await chrome.storage.local.set({ notionToken, notionDbId });

  // プロパティ用画像（クリックで選択した画像）
  const coverImage = imageCandidates.length > 0 ? imageCandidates[currentImageIndex] : "";

  // ページカバー用画像（右クリックで選択、未選択ならプロパティ用と同じ）
  const pageCoverImage = pageCoverIndex >= 0 ? imageCandidates[pageCoverIndex] : coverImage;

  // 残りの画像をファイルプロパティ用に収集
  const otherImages = imageCandidates.filter((_, i) => i !== currentImageIndex);

  // ペイロードを構築
  const payload = {
    pageId: existingPageId, // 既存IDがあれば含める
    title: titleEl.value.trim(),
    description: noteEl.value.trim(),
    comment: commentEl.value.trim(),
    url: extractedData?.url || "",
    asin: currentAsin,
    image: coverImage,
    pageCoverImage: pageCoverImage,
    images: otherImages,
    tags: tags,
    rating: currentRating,
    director: extractedData?.director || "",
    releaseYear: extractedData?.releaseYear || "",
    date: extractedData?.date || new Date().toISOString().split('T')[0],
    status: currentStatus,
    statusType: currentStatusType,
    hasCover: hasCover,
    overwriteCover: overwriteCoverEl.checked,
    existingFiles: existingFiles,
    watched: true
  };

  try {
    statusEl.textContent = "Notionに送信中...";
    const res = await chrome.runtime.sendMessage({ type: "CREATE_NOTION_PAGE", payload });

    if (res?.ok) {
      statusEl.textContent = existingPageId ? "保存（更新）完了！" : "保存完了！";
      statusEl.className = "status success";
      // 更新後のID（新規作成の場合）を保持する（連続保存対応）
      if (res.id) existingPageId = res.id;
    } else {
      throw new Error(res?.error || "不明なエラー");
    }
  } catch (e) {
    statusEl.textContent = `失敗: ${e.message}`;
    statusEl.className = "status error";
    console.error(e);
  } finally {
    saveBtn.disabled = false;
  }
});
