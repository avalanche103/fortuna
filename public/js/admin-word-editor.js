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
    if (textarea.id === 'news-excerpt') shell.classList.add('word-editor--excerpt');

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
      'Enter — новая строка. Два раза Enter подряд — отступ между строками.';

    textarea.classList.add('word-editor__source');
    textarea.setAttribute('tabindex', '-1');
    const nativeRequired = textarea.required || textarea.dataset.required === 'true';
    textarea.required = false;
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

    function syncBeforeValidate() {
      sync();
      if (nativeRequired && !String(textarea.value || '').trim()) {
        area.classList.add('is-invalid');
        if (!shell.querySelector('.word-editor__error')) {
          const err = document.createElement('p');
          err.className = 'word-editor__error';
          err.textContent = mode === 'html' ? 'Введите текст новости' : 'Заполните поле';
          shell.appendChild(err);
        }
        area.focus();
        return false;
      }
      area.classList.remove('is-invalid');
      shell.querySelector('.word-editor__error')?.remove();
      return true;
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

    function blockForCaret() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      return node instanceof HTMLElement ? node.closest('p,div,h1,h2,h3,h4,blockquote,li') : null;
    }

    function blockEndsWithBreak(block) {
      if (!block) return false;
      const html = block.innerHTML.replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ').trim();
      if (!html || html === '<br>' || html === '<br/>') return true;
      let last = block.lastChild;
      while (
        last &&
        last.nodeType === Node.TEXT_NODE &&
        !String(last.textContent || '').replace(/\u00a0/g, ' ').trim()
      ) {
        last = last.previousSibling;
      }
      return Boolean(last && last.nodeName === 'BR');
    }

    function removeTrailingBreak(block) {
      if (!block) return;
      let last = block.lastChild;
      while (
        last &&
        last.nodeType === Node.TEXT_NODE &&
        !String(last.textContent || '').replace(/\u00a0/g, ' ').trim()
      ) {
        const prev = last.previousSibling;
        last.remove();
        last = prev;
      }
      if (last && last.nodeName === 'BR') last.remove();
    }

    area.addEventListener('keydown', (event) => {
      if (!allowMarkup && (event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      const block = blockForCaret();
      if (block && block.closest('li')) {
        document.execCommand('defaultParagraphSeparator', false, 'p');
        return;
      }

      event.preventDefault();
      document.execCommand('defaultParagraphSeparator', false, 'p');
      if (blockEndsWithBreak(block)) {
        removeTrailingBreak(block);
        exec('insertParagraph');
      } else {
        exec('insertLineBreak');
      }
      normalizeArea(area);
      sync();
    });

    area.addEventListener('paste', (event) => {
      const data = event.clipboardData;
      if (!data) return;
      const html = data.getData('text/html') || '';
      const hasImage =
        [...(data.files || [])].some((file) => /^image\//i.test(file.type)) ||
        [...(data.items || [])].some((item) => item.kind === 'file' && /^image\//i.test(item.type)) ||
        /<img[^>]+src=["']data:image\//i.test(html);
      if (hasImage && (tools === 'news' || tools === 'html')) return;

      event.preventDefault();
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

    area.addEventListener('input', () => {
      area.classList.remove('is-invalid');
      shell.querySelector('.word-editor__error')?.remove();
      sync();
    });

    // HTML5 checks required fields BEFORE the submit event — sync earlier.
    const form = textarea.form;
    if (form) {
      form.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const submitter = target.closest('button[type="submit"], input[type="submit"]');
          if (!submitter || !form.contains(submitter)) return;
          sync();
        },
        true
      );
      form.addEventListener('submit', (event) => {
        if (!syncBeforeValidate()) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }
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
