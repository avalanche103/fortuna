(function () {
  const dropzone = document.getElementById('image-dropzone');
  const fileInput = document.getElementById('image-file-input');
  const browseBtn = document.getElementById('image-browse-btn');
  const statusEl = document.getElementById('image-dropzone-status');
  const previews = document.getElementById('image-previews');
  const bodyField = document.getElementById('news-body');
  if (!dropzone || !fileInput || !bodyField) return;

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('is-error', Boolean(isError));
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
    const images = [...files].filter((file) => /^image\//i.test(file.type));
    if (!images.length) {
      setStatus('Нужны файлы изображений', true);
      return;
    }

    setStatus('Загрузка…');
    let uploaded = 0;

    for (const file of images) {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const response = await fetch('/admin/news/upload-image', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        });
        const data = await response.json();
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
})();
