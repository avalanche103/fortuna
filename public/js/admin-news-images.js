(function () {
  const dropzone = document.getElementById('image-dropzone');
  const fileInput = document.getElementById('image-file-input');
  const browseBtn = document.getElementById('image-browse-btn');
  const statusEl = document.getElementById('image-dropzone-status');
  const previews = document.getElementById('image-previews');
  const bodyField = document.getElementById('news-body');
  const bodyStatus = document.getElementById('news-body-status');
  const toolbar = document.getElementById('news-editor-toolbar');
  if (!dropzone || !fileInput || !bodyField) return;

  function setStatus(text, isError) {
    [statusEl, bodyStatus].forEach((el) => {
      if (!el) return;
      el.hidden = !text;
      el.textContent = text || '';
      el.classList.toggle('is-error', Boolean(isError));
    });
  }

  const newsForm = document.getElementById('news-form');
  const submitBtn = newsForm?.querySelector('button[type="submit"]');
  let uploadsInFlight = 0;
  const MAX_IMAGE_EDGE = 1600;
  const JPEG_QUALITY = 0.82;

  function setUploading(active) {
    uploadsInFlight += active ? 1 : -1;
    if (uploadsInFlight < 0) uploadsInFlight = 0;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = uploadsInFlight > 0;
  }

  function namedImageFile(file) {
    if (file.name && /\.[a-z0-9]+$/i.test(file.name)) return file;
    const extByType = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
    };
    const ext = extByType[file.type] || '.jpg';
    return new File([file], 'image' + ext, { type: file.type || 'image/jpeg' });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать картинку'));
      };
      img.src = url;
    });
  }

  async function compressImageFile(file) {
    const type = String(file.type || '').toLowerCase();
    if (type === 'image/gif' || type === 'image/svg+xml') return namedImageFile(file);
    try {
      const img = await loadImageFromFile(file);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return namedImageFile(file);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      );
      if (!blob || blob.size === 0) return namedImageFile(file);
      const base = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
      return new File([blob], base + '.jpg', { type: 'image/jpeg' });
    } catch {
      return namedImageFile(file);
    }
  }

  function insertAtCursor(textarea, html) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const needsNewlineBefore = before && !/\n\s*$/.test(before);
    const needsNewlineAfter = after && !/^\s*\n/.test(after);
    const chunk =
      (needsNewlineBefore ? '\n' : '') + html + (needsNewlineAfter ? '\n' : '');
    textarea.value = before + chunk + after;
    const caret = (before + chunk).length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function getSelectedText(textarea) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    return textarea.value.slice(start, end);
  }

  function replaceSelection(textarea, replacement) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = before + replacement + after;
    const caret = before.length + replacement.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wrapSelection(textarea, before, after, fallback) {
    const selected = getSelectedText(textarea).trim();
    const content = selected || fallback;
    replaceSelection(textarea, before + content + after);
  }

  function toYouTubeEmbed(url) {
    try {
      const parsed = new URL(url.trim());
      let videoId = '';
      if (parsed.hostname.includes('youtu.be')) {
        videoId = parsed.pathname.replace('/', '');
      } else if (parsed.hostname.includes('youtube.com')) {
        videoId = parsed.searchParams.get('v') || '';
        if (!videoId && parsed.pathname.startsWith('/shorts/')) {
          videoId = parsed.pathname.split('/')[2] || '';
        }
      }
      if (!videoId) return null;
      return 'https://www.youtube.com/embed/' + videoId;
    } catch {
      return null;
    }
  }

  function insertYoutube() {
    const raw = window.prompt('Вставьте ссылку YouTube');
    if (!raw) return;
    const embedUrl = toYouTubeEmbed(raw);
    if (!embedUrl) {
      setStatus('Не удалось распознать ссылку YouTube', true);
      return;
    }
    insertAtCursor(
      bodyField,
      '<p><iframe width="560" height="315" src="' +
        embedUrl +
        '" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></p>'
    );
    setStatus('YouTube-видео вставлено');
  }

  function toReelEmbed(url) {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.replace(/^www\./, '');
      const path = parsed.pathname.replace(/\/+$/, '');

      if (host.includes('instagram.com')) {
        const match = path.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
        if (!match) return null;
        const kind = match[1] === 'p' ? 'p' : 'reel';
        return {
          src: 'https://www.instagram.com/' + kind + '/' + match[2] + '/embed',
          title: 'Instagram Reels',
        };
      }

      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        const embedUrl = toYouTubeEmbed(url);
        if (!embedUrl) return null;
        return { src: embedUrl, title: 'YouTube Shorts' };
      }

      if (host.includes('facebook.com') || host.includes('fb.watch')) {
        const reelId = path.match(/\/reel[s]?\/(\d+)/);
        const permalink = reelId
          ? 'https://www.facebook.com/reel/' + reelId[1]
          : parsed.href;
        return {
          src:
            'https://www.facebook.com/plugins/video.php?href=' +
            encodeURIComponent(permalink) +
            '&show_text=false',
          title: 'Facebook Reels',
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  function insertReel() {
    const raw = window.prompt('Вставьте ссылку на Reels (Instagram, YouTube Shorts или Facebook)');
    if (!raw) return;
    const embed = toReelEmbed(raw);
    if (!embed) {
      setStatus('Не удалось распознать ссылку Reels', true);
      return;
    }
    insertAtCursor(
      bodyField,
      '<p class="news-embed news-embed--reel"><iframe src="' +
        embed.src +
        '" title="' +
        embed.title +
        '" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></p>'
    );
    setStatus('Reels вставлен');
  }

  function appendPreview(url) {
    if (!previews) return;
    const item = document.createElement('div');
    item.className = 'image-dropzone__preview';
    item.innerHTML =
      '<img src="' +
      url +
      '" alt="">' +
      '<button type="button" class="image-dropzone__insert">В текст</button>';
    item.querySelector('button')?.addEventListener('click', () => {
      insertAtCursor(bodyField, '<p><img src="' + url + '" alt=""></p>');
      setStatus('Картинка вставлена в текст');
    });
    previews.appendChild(item);
  }

  async function uploadFiles(files, insertMode) {
    const images = [...files].filter((file) => !file.type || /^image\//i.test(file.type));
    if (!images.length) {
      setStatus('Нужны файлы изображений', true);
      return;
    }

    setStatus('Загрузка…');
    setUploading(true);
    let uploaded = 0;

    try {
      for (const file of images) {
        const formData = new FormData();
        formData.append('image', await compressImageFile(file));
        try {
          const response = await fetch('/admin/news/upload-image', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
          });
          const raw = await response.text();
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            throw new Error(
              response.status === 413
                ? 'Файл слишком большой для хостинга'
                : 'Сервер не принял картинку'
            );
          }
          if (!response.ok || !data.url) {
            throw new Error(data.error || 'Ошибка загрузки');
          }
          appendPreview(data.url);
          if (insertMode === 'cursor' || insertMode === 'append') {
            insertAtCursor(bodyField, '<p><img src="' + data.url + '" alt=""></p>');
          }
          uploaded += 1;
        } catch (err) {
          setStatus(err instanceof Error ? err.message : 'Ошибка загрузки', true);
          return;
        }
      }

      setStatus(
        uploaded === 1
          ? 'Картинка загружена'
          : 'Загружено картинок: ' + uploaded
      );
    } finally {
      setUploading(false);
    }
  }

  function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, preventDefaults);
    bodyField.addEventListener(eventName, preventDefaults);
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('is-dragover'));
    bodyField.addEventListener(eventName, () => bodyField.classList.add('is-dragover'));
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('is-dragover'));
    bodyField.addEventListener(eventName, () => bodyField.classList.remove('is-dragover'));
  });

  dropzone.addEventListener('drop', (event) => {
    const files = event.dataTransfer?.files;
    if (files?.length) uploadFiles(files, 'append');
  });

  bodyField.addEventListener('drop', (event) => {
    const files = event.dataTransfer?.files;
    if (files?.length) uploadFiles(files, 'cursor');
  });

  browseBtn?.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (event) => {
    if (event.target === browseBtn) return;
    if ((event.target).closest?.('button')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) {
      uploadFiles(fileInput.files, 'append');
      fileInput.value = '';
    }
  });

  const coverPaste = document.getElementById('cover-paste');
  const coverCatcher = document.getElementById('cover-catcher');
  const coverInput = document.getElementById('cover-image-input');
  const coverEmpty = document.getElementById('cover-empty');
  const coverFilled = document.getElementById('cover-filled');
  const coverPreview = document.getElementById('cover-preview');
  const coverStatus = document.getElementById('cover-status');
  const coverRemove = document.getElementById('cover-remove');
  const coverBrowse = document.getElementById('cover-browse');
  const coverFileInput = document.getElementById('cover-file-input');

  function setCoverStatus(text, isError) {
    if (!coverStatus) return;
    coverStatus.hidden = !text;
    coverStatus.textContent = text || '';
    coverStatus.classList.toggle('is-error', Boolean(isError));
  }

  function showCover(url) {
    if (coverInput) coverInput.value = url || '';
    if (coverPreview) coverPreview.src = url || '';
    if (coverEmpty) coverEmpty.hidden = Boolean(url);
    if (coverFilled) coverFilled.hidden = !url;
    if (coverRemove) coverRemove.hidden = !url;
  }

  function fileFromDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return null;
    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], 'cover.png', { type: match[1] });
    } catch {
      return null;
    }
  }

  function filesFromClipboard(event) {
    const files = [];
    const data = event.clipboardData;
    if (!data) return files;
    if (data.files && data.files.length) {
      for (const file of data.files) {
        if (/^image\//i.test(file.type) || !file.type) files.push(file);
      }
    }
    if (!files.length && data.items) {
      for (const item of data.items) {
        if (item.kind === 'file' && /^image\//i.test(item.type)) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (!files.length) {
      const html = data.getData('text/html') || '';
      const text = data.getData('text/plain') || '';
      const src = (html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || text;
      const fromData = fileFromDataUrl(src);
      if (fromData) files.push(fromData);
    }
    return files;
  }

  bodyField.addEventListener('paste', (event) => {
    const files = filesFromClipboard(event);
    if (!files.length) return;
    event.preventDefault();
    uploadFiles(files, 'cursor');
  });

  async function uploadCover(file) {
    setCoverStatus('Сжимаем и загружаем…');
    setUploading(true);
    const formData = new FormData();
    formData.append('image', await compressImageFile(namedImageFile(file)));
    try {
      const response = await fetch('/admin/news/upload-image', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(response.status === 413 ? 'Файл слишком большой для хостинга' : 'Сервер не принял картинку');
      }
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Ошибка загрузки');
      }
      showCover(data.url);
      setCoverStatus('Заглавная картинка вставлена');
      if (coverCatcher) coverCatcher.value = '';
    } catch (err) {
      setCoverStatus(err instanceof Error ? err.message : 'Ошибка загрузки', true);
    } finally {
      setUploading(false);
    }
  }

  function onCoverPaste(event) {
    const files = filesFromClipboard(event);
    if (!files.length) {
      setCoverStatus('В буфере нет картинки — выберите файл', true);
      return;
    }
    event.preventDefault();
    uploadCover(files[0]);
  }

  coverPaste?.addEventListener('click', (event) => {
    if (event.target === coverRemove || event.target === coverBrowse) return;
    if (event.target instanceof HTMLElement && event.target.closest('#cover-browse, #cover-remove')) return;
    coverCatcher?.focus();
  });

  coverCatcher?.addEventListener('paste', onCoverPaste);
  coverPaste?.addEventListener('paste', onCoverPaste);
  coverPaste?.addEventListener('dragover', (event) => event.preventDefault());
  function onCoverDrop(event) {
    event.preventDefault();
    const dropped = [...(event.dataTransfer?.files || [])].filter((file) => /^image\//i.test(file.type) || !file.type);
    if (dropped.length) uploadCover(dropped[0]);
  }
  coverPaste?.addEventListener('drop', onCoverDrop);
  coverCatcher?.addEventListener('drop', onCoverDrop);

  coverBrowse?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    coverFileInput?.click();
  });
  coverFileInput?.addEventListener('change', () => {
    const file = coverFileInput.files && coverFileInput.files[0];
    if (file) uploadCover(file);
    coverFileInput.value = '';
  });

  coverRemove?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCover('');
    setCoverStatus('Заглавная картинка убрана');
    coverCatcher?.focus();
  });

  toolbar?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('button[data-action]');
    if (!(button instanceof HTMLButtonElement)) return;
    const action = button.dataset.action;
    if (!action) return;

    switch (action) {
      case 'paragraph':
        wrapSelection(bodyField, '<p>', '</p>', 'Текст абзаца');
        break;
      case 'line-break':
        insertAtCursor(bodyField, '<br>');
        break;
      case 'h2':
        wrapSelection(bodyField, '<h2>', '</h2>', 'Подзаголовок');
        break;
      case 'h3':
        wrapSelection(bodyField, '<h3>', '</h3>', 'Подзаголовок');
        break;
      case 'quote':
        wrapSelection(bodyField, '<blockquote><p>', '</p></blockquote>', 'Текст цитаты');
        break;
      case 'ul':
        replaceSelection(
          bodyField,
          '<ul>\n  <li>Пункт 1</li>\n  <li>Пункт 2</li>\n</ul>'
        );
        break;
      case 'ol':
        replaceSelection(
          bodyField,
          '<ol>\n  <li>Пункт 1</li>\n  <li>Пункт 2</li>\n</ol>'
        );
        break;
      case 'link': {
        const href = window.prompt('Вставьте URL ссылки');
        if (!href) break;
        const selected = getSelectedText(bodyField).trim() || 'Ссылка';
        replaceSelection(bodyField, '<a href="' + href.trim() + '">' + selected + '</a>');
        break;
      }
      case 'youtube':
        insertYoutube();
        break;
      case 'reel':
        insertReel();
        break;
      default:
        break;
    }
  });
})();
