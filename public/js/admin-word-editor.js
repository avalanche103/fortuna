(function () {
  const editors = new WeakMap();

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function textToHtml(text) {
    const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!raw.trim()) return '<p><br></p>';
    return raw
      .split(/\n{2,}/)
      .map((block) => {
        const html = escapeHtml(block).replace(/\n/g, '<br>');
        return '<p>' + (html || '<br>') + '</p>';
      })
      .join('');
  }

  function htmlToText(root) {
    const blocks = [];

    function pushBlock(text) {
      const cleaned = String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (cleaned) blocks.push(cleaned);
    }

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      if (!(node instanceof HTMLElement)) return '';
      const tag = node.tagName;
      if (tag === 'BR') return '\n';
      if (tag === 'IMG' || tag === 'IFRAME') return '';

      const inner = [...node.childNodes].map(walk).join('');
      if (/^(P|DIV|H1|H2|H3|H4|BLOCKQUOTE|LI|TR)$/.test(tag)) {
        pushBlock(inner);
        return '';
      }
      if (tag === 'UL' || tag === 'OL') {
        [...node.children].forEach((child) => walk(child));
        return '';
      }
      return inner;
    }

    [...root.childNodes].forEach((child) => {
      const leftover = walk(child);
      if (leftover) pushBlock(leftover);
    });

    return blocks.join('\n\n');
  }

  function normalizeArea(area) {
    if (!area.innerHTML.trim() || area.innerHTML === '<br>') {
      area.innerHTML = '<p><br></p>';
    }
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function exec(command, value) {
    document.execCommand(command, false, value);
  }

  function addButton(toolbar, label, title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'word-editor__btn';
    btn.textContent = label;
    if (title) btn.title = title;
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      onClick();
    });
    toolbar.appendChild(btn);
    return btn;
  }

  function wrapTextarea(textarea, options) {
    if (!(textarea instanceof HTMLTextAreaElement)) return null;
    if (editors.has(textarea)) return editors.get(textarea);

    const mode = options.mode || textarea.dataset.mode || 'text';
    const tools = options.tools || textarea.dataset.tools || (mode === 'html' ? 'html' : 'text');

    const shell = document.createElement('div');
    shell.className = 'word-editor';
    if (textarea.id === 'news-body') shell.classList.add('word-editor--news');

    const toolbar = document.createElement('div');
    toolbar.className = 'word-editor__toolbar';

    const area = document.createElement('div');
    area.className = 'word-editor__area';
    area.contentEditable = 'true';
    area.spellcheck = true;
    area.setAttribute('role', 'textbox');
    area.setAttribute('aria-multiline', 'true');
    if (textarea.getAttribute('aria-label')) {
      area.setAttribute('aria-label', textarea.getAttribute('aria-label'));
    }

    const hint = document.createElement('p');
    hint.className = 'word-editor__hint';
    hint.textContent =
      'Enter — новый абзац с отступом, как в Word. Shift+Enter — перенос строки без отступа.';

    textarea.classList.add('word-editor__source');
    textarea.setAttribute('tabindex', '-1');
    textarea.parentNode.insertBefore(shell, textarea);
    shell.appendChild(toolbar);
    shell.appendChild(area);
    shell.appendChild(hint);
    shell.appendChild(textarea);

    if (mode === 'html') {
      area.innerHTML = textarea.value.trim() ? textarea.value : '<p><br></p>';
    } else {
      area.innerHTML = textToHtml(textarea.value);
    }
    normalizeArea(area);

    function isVisuallyEmpty() {
      return !area.textContent.trim() && !area.querySelector('img, iframe, video');
    }

    function sync() {
      if (mode === 'html') {
        textarea.value = isVisuallyEmpty() ? '' : area.innerHTML;
      } else {
        textarea.value = htmlToText(area);
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function focusArea() {
      area.focus();
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    }

    function insertHtml(html) {
      focusArea();
      exec('insertHTML', html);
      normalizeArea(area);
      sync();
    }

    function currentFontSize() {
      const raw = document.queryCommandValue('fontSize');
      const size = parseInt(raw, 10);
      return size >= 1 && size <= 7 ? size : 3;
    }

    function bumpFontSize(delta) {
      focusArea();
      exec('styleWithCSS', false);
      const next = Math.min(7, Math.max(1, currentFontSize() + delta));
      exec('fontSize', String(next));
      sync();
    }

    const allowMarkup = mode === 'html' || tools === 'news' || tools === 'html';
    if (allowMarkup) {
      addButton(toolbar, 'Жирный', 'Полужирный текст', () => {
        focusArea();
        exec('bold');
        sync();
      });
      addButton(toolbar, 'Курсив', 'Курсив', () => {
        focusArea();
        exec('italic');
        sync();
      });
      addButton(toolbar, 'Подчёркнутый', 'Подчёркнутый текст', () => {
        focusArea();
        exec('underline');
        sync();
      });
      addButton(toolbar, 'Крупнее', 'Увеличить шрифт', () => {
        bumpFontSize(1);
      });
      addButton(toolbar, 'Мельче', 'Уменьшить шрифт', () => {
        bumpFontSize(-1);
      });
      addButton(toolbar, 'Подзаголовок', 'Заголовок раздела', () => {
        focusArea();
        exec('formatBlock', 'h2');
        sync();
      });
      addButton(toolbar, 'Список', 'Маркированный список', () => {
        focusArea();
        exec('insertUnorderedList');
        sync();
      });
      addButton(toolbar, 'Нумерация', 'Нумерованный список', () => {
        focusArea();
        exec('insertOrderedList');
        sync();
      });
      addButton(toolbar, 'Ссылка', 'Вставить ссылку', () => {
        const href = window.prompt('Вставьте адрес ссылки', 'https://');
        if (!href) return;
        focusArea();
        exec('createLink', href.trim());
        sync();
      });
      addButton(toolbar, 'Цитата', 'Оформить цитату', () => {
        focusArea();
        exec('formatBlock', 'blockquote');
        sync();
      });
    } else {
      toolbar.hidden = true;
    }

    area.addEventListener('focus', () => {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    });

    area.addEventListener('keydown', (event) => {
      if (!allowMarkup && (event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      document.execCommand('defaultParagraphSeparator', false, 'p');
    });

    area.addEventListener('input', sync);

    area.addEventListener('paste', (event) => {
      const data = event.clipboardData;
      if (!data) return;
      const hasImage = [...(data.files || [])].some((file) => /^image\//i.test(file.type))
        || [...(data.items || [])].some((item) => item.kind === 'file' && /^image\//i.test(item.type));
      if (hasImage && (tools === 'news' || tools === 'html')) return;

      event.preventDefault();
      const html = data.getData('text/html');
      const text = data.getData('text/plain');
      if (html && mode === 'html') {
        const clean = html
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<\/?(meta|link|style|script|xml|o:[^>]+)[^>]*>/gi, '');
        exec('insertHTML', clean);
      } else if (text) {
        const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
        const htmlBlocks = paragraphs
          .map((block) => '<p>' + escapeHtml(block).replace(/\n/g, '<br>') + '</p>')
          .join('');
        exec('insertHTML', htmlBlocks);
      }
      normalizeArea(area);
      sync();
    });

    textarea.form?.addEventListener('submit', sync);
    sync();

    const api = { area, toolbar, shell, sync, insertHtml, focusArea, mode };
    editors.set(textarea, api);
    return api;
  }

  function getEditor(textarea) {
    return editors.get(textarea) || null;
  }

  window.FortunaWordEditor = {
    wrapTextarea,
    getSurface(textarea) {
      return getEditor(textarea)?.area || textarea;
    },
    getToolbar(textarea) {
      return getEditor(textarea)?.toolbar || null;
    },
    insertHtml(textarea, html) {
      const editor = getEditor(textarea);
      if (editor) editor.insertHtml(html);
    },
  };

  document.querySelectorAll('textarea.js-word-editor').forEach((textarea) => {
    wrapTextarea(textarea, {});
  });
})();
