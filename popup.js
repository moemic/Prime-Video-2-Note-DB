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


const statusEl = document.getElementById("status");
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const tokenEl = document.getElementById("token");
const dbEl = document.getElementById("db");
const saveBtn = document.getElementById("saveBtn"); // 明示的に取得
const duplicateWarning = document.getElementById("duplicateWarning");
const duplicateLink = document.getElementById("duplicateLink");

// 状態
const VERSION = "v1.2.0";
let currentRating = 0;
let tags = [];
let extractedData = {}; // nullからオブジェクトに変更
let imageCandidates = []; // 新しい状態変数
let currentImageIndex = 0; // selected image
let slideIndex = 0; // scroll position
let existingPageId = null; // 既存ページID

// 初期化
(async () => {
  // 設定を読み込み (localに変更)
  const { notionToken, notionDbId } = await chrome.storage.local.get(["notionToken", "notionDbId"]);

  if (notionToken) tokenEl.value = notionToken;

  const WRONG_ID = '6c0e197a-edbb-47c4-bc2e-00809eced2f9';
  const CORRECT_ID = 'd419b59d-4c9c-48ad-b5b7-be5db902c1cd';

  if (notionDbId && notionDbId !== WRONG_ID) {
    dbEl.value = notionDbId;
  } else {
    dbEl.value = CORRECT_ID;
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
    // coverPlaceholder.textContent = "抽出に失敗"; // Removed coverPlaceholder
    carouselTrack.innerHTML = '<div style="color:#aaa; padding:10px;">抽出に失敗</div>';
  }

  // 既存タグの取得
  fetchNotionTags();
})();

async function checkDuplicate(title) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHECK_DUPLICATE", title });
    if (res?.ok && res.duplicate) {
      existingPageId = res.pageId;
      duplicateWarning.innerHTML = `⚠️ すでに登録されています。既存データを読み込みました：<a id="duplicateLink" href="${res.url}" target="_blank">Notionを開く</a>`;

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

      duplicateWarning.style.display = "block";
    } else {
      existingPageId = null;
      duplicateWarning.style.display = "none";
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

// メッセージリスナー
chrome.runtime.onMessage.addListener((msg) => {
  // 抽出完了メッセージ等のハンドリング
  handleExtractedMessage(msg);
  return true;
});

// データ処理ハンドラ
function handleExtractedMessage(data) {
  if (data.title) {
    titleEl.value = data.title;
    extractedData.title = data.title;
    // 重複チェック実行
    checkDuplicate(data.title);
  }
  if (data.description) {
    noteEl.value = data.description;
    extractedData.description = data.description;
  }
  if (data.director) {
    extractedData.director = data.director;
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
      carouselTrack.appendChild(img);
    });
  }

  // 2. Update Selection Style
  const items = carouselTrack.querySelectorAll('.carousel-item');
  items.forEach((item, index) => {
    if (index === currentImageIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
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

  // 選択された画像を使用
  const coverImage = imageCandidates.length > 0 ? imageCandidates[currentImageIndex] : "";

  // 残りの画像（カバー以外）をファイルプロパティ用に収集
  const otherImages = imageCandidates.filter((_, i) => i !== currentImageIndex);

  // ペイロードを構築
  const payload = {
    pageId: existingPageId, // 既存IDがあれば含める
    title: titleEl.value.trim(),
    description: noteEl.value.trim(),
    comment: commentEl.value.trim(),
    url: extractedData?.url || "",
    image: coverImage,
    images: otherImages,
    tags: tags,
    rating: currentRating,
    director: extractedData?.director || "",
    date: new Date().toISOString().split('T')[0],
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
