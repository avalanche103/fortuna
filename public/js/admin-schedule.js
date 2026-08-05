(function () {
  const form = document.getElementById('schedule-form');
  if (!form) return;

  const dirtyLabel = document.getElementById('schedule-dirty');
  const dialog = document.getElementById('schedule-editor');
  const editorTitle = document.getElementById('schedule-editor-title');
  const editorDate = document.getElementById('schedule-editor-date');
  const editorStart = document.getElementById('editor-start');
  const editorEnd = document.getElementById('editor-end');
  const editorLocation = document.getElementById('editor-location');
  const editorNote = document.getElementById('editor-note');
  const copyButton = dialog.querySelector('.schedule-editor__copy');
  let dirty = false;
  let activeCell = null;

  function fields(cell) {
    return {
      start: cell.querySelector('.slot-start'),
      end: cell.querySelector('.slot-end'),
      location: cell.querySelector('.slot-location'),
      note: cell.querySelector('.slot-note'),
    };
  }

  function textColor(color) {
    const match = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!match) return '#ffffff';
    const value = parseInt(match[1], 16);
    const brightness = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
    return brightness > 155 ? '#102451' : '#ffffff';
  }

  function selectedLocation(value) {
    return Array.from(editorLocation.options).find(function (option) {
      return option.value === value;
    });
  }

  function renderCell(cell) {
    const values = fields(cell);
    const card = cell.querySelector('.schedule-slot-card');
    const time = card.querySelector('.schedule-slot-card__time');
    const location = card.querySelector('.schedule-slot-card__location');
    const note = card.querySelector('.schedule-slot-card__note');
    const hasValue = values.start.value || values.end.value || values.location.value || values.note.value.trim();
    const option = selectedLocation(values.location.value);
    const color = option && option.dataset.color ? option.dataset.color : '#6b7280';

    time.textContent = values.start.value
      ? values.start.value + (values.end.value ? '–' + values.end.value : '')
      : (hasValue ? 'Настроено' : '+ Добавить');
    location.textContent = hasValue ? (option && option.value ? option.textContent.trim() : 'Без площадки') : '';
    note.textContent = hasValue ? values.note.value.trim() : '';
    card.classList.toggle('has-value', Boolean(hasValue));
    if (hasValue) {
      card.style.setProperty('--slot-color', color);
      card.style.setProperty('--slot-text', textColor(color));
    } else {
      card.style.removeProperty('--slot-color');
      card.style.removeProperty('--slot-text');
    }
  }

  function markDirty() {
    dirty = true;
    if (dirtyLabel) dirtyLabel.textContent = 'Есть несохранённые изменения';
  }

  function openEditor(cell) {
    activeCell = cell;
    const values = fields(cell);
    editorStart.value = values.start.value;
    editorEnd.value = values.end.value;
    editorLocation.value = values.location.value;
    editorNote.value = values.note.value;
    editorTitle.textContent = cell.dataset.groupLabel;
    editorDate.textContent = cell.dataset.dateLabel;
    copyButton.disabled = Number(cell.dataset.day) <= 1;
    updateEditorColor();
    dialog.showModal();
  }

  function closeEditor() {
    activeCell = null;
    dialog.close();
  }

  function updateEditorColor() {
    const option = editorLocation.selectedOptions[0];
    dialog.style.setProperty('--editor-color', option && option.dataset.color ? option.dataset.color : '#6b7280');
  }

  function validateEditor() {
    if (Boolean(editorStart.value) !== Boolean(editorEnd.value)) {
      window.alert('Укажите и начало, и окончание занятия.');
      return false;
    }
    if (editorStart.value && editorEnd.value && editorStart.value >= editorEnd.value) {
      window.alert('Время окончания должно быть позже начала.');
      return false;
    }
    return true;
  }

  form.addEventListener('click', function (event) {
    const card = event.target.closest('.schedule-slot-card');
    if (card) openEditor(card.closest('.schedule-admin-cell'));
  });

  editorLocation.addEventListener('change', updateEditorColor);

  dialog.querySelector('.schedule-editor__close').addEventListener('click', closeEditor);
  dialog.querySelector('.schedule-editor__cancel').addEventListener('click', closeEditor);

  dialog.querySelector('.schedule-editor__clear').addEventListener('click', function () {
    editorStart.value = '';
    editorEnd.value = '';
    editorLocation.value = '';
    editorNote.value = '';
    updateEditorColor();
  });

  copyButton.addEventListener('click', function () {
    if (!activeCell) return;
    const previous = form.querySelector(
      `.schedule-admin-cell[data-day="${Number(activeCell.dataset.day) - 1}"][data-group="${activeCell.dataset.group}"]`
    );
    if (!previous) return;
    const source = fields(previous);
    editorStart.value = source.start.value;
    editorEnd.value = source.end.value;
    editorLocation.value = source.location.value;
    editorNote.value = source.note.value;
    updateEditorColor();
  });

  dialog.querySelector('.schedule-editor__apply').addEventListener('click', function () {
    if (!activeCell || !validateEditor()) return;
    const values = fields(activeCell);
    const before = [values.start.value, values.end.value, values.location.value, values.note.value].join('\u0000');
    values.start.value = editorStart.value;
    values.end.value = editorEnd.value;
    values.location.value = editorLocation.value;
    values.note.value = editorNote.value.trim();
    const after = [values.start.value, values.end.value, values.location.value, values.note.value].join('\u0000');
    renderCell(activeCell);
    if (before !== after) markDirty();
    closeEditor();
  });

  form.addEventListener('submit', function () {
    dirty = false;
  });

  window.addEventListener('beforeunload', function (event) {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();
