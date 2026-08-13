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
  const editorDouble = document.getElementById('editor-double');
  const editorSecondShift = document.getElementById('editor-second-shift');
  const editorStart2 = document.getElementById('editor-start-2');
  const editorEnd2 = document.getElementById('editor-end-2');
  const editorLocation2 = document.getElementById('editor-location-2');
  const editorNote = document.getElementById('editor-note');
  const editorNote2 = document.getElementById('editor-note-2');
  const copyButton = dialog.querySelector('.schedule-editor__copy');
  let dirty = false;
  let activeCell = null;

  function fields(cell) {
    return {
      start: cell.querySelector('.slot-start'),
      end: cell.querySelector('.slot-end'),
      location: cell.querySelector('.slot-location'),
      isDouble: cell.querySelector('.slot-double'),
      start2: cell.querySelector('.slot-start-2'),
      end2: cell.querySelector('.slot-end-2'),
      location2: cell.querySelector('.slot-location-2'),
      note: cell.querySelector('.slot-note'),
      note2: cell.querySelector('.slot-note-2'),
    };
  }

  function textColor(color) {
    const match = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!match) return '#ffffff';
    const value = parseInt(match[1], 16);
    const brightness = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
    return brightness > 155 ? '#102451' : '#ffffff';
  }

  function selectedLocation(select, value) {
    return Array.from(select.options).find(function (option) {
      return option.value === value;
    });
  }

  function formatRange(start, end) {
    if (!start) return '';
    return normalizeTime(start) + (end ? '–' + normalizeTime(end) : '');
  }

  function normalizeTime(value) {
    const raw = String(value || '').trim().replace(',', '.').replace('.', ':');
    if (!raw) return '';
    const match = raw.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
    if (!match) return raw;
    return String(Number(match[1])).padStart(2, '0') + ':' + match[2];
  }

  function syncSecondShiftVisibility() {
    const enabled = editorDouble.checked;
    editorSecondShift.hidden = !enabled;
    if (!enabled) {
      editorStart2.value = '';
      editorEnd2.value = '';
      editorLocation2.value = '';
      editorNote2.value = '';
    }
  }

  function renderCell(cell) {
    const values = fields(cell);
    const card = cell.querySelector('.schedule-slot-card');
    const time = card.querySelector('.schedule-slot-card__time');
    const location = card.querySelector('.schedule-slot-card__location');
    const note = card.querySelector('.schedule-slot-card__note');
    const isDouble = values.isDouble.value === '1';
    const hasValue =
      values.start.value ||
      values.end.value ||
      values.location.value ||
      values.start2.value ||
      values.end2.value ||
      values.location2.value ||
      values.note.value.trim() ||
      values.note2.value.trim();
    const option = selectedLocation(editorLocation, values.location.value);
    const option2 = selectedLocation(editorLocation2, values.location2.value);
    const color = option && option.dataset.color ? option.dataset.color : '#6b7280';
    const firstRange = formatRange(values.start.value, values.end.value);
    const secondRange = isDouble ? formatRange(values.start2.value, values.end2.value) : '';

    time.textContent = firstRange
      ? firstRange + (secondRange ? ' / ' + secondRange : '')
      : (hasValue ? 'Настроено' : '+ Добавить');

    const locationParts = [];
    if (hasValue) {
      locationParts.push(option && option.value ? option.textContent.trim() : 'Без площадки');
      if (isDouble) {
        locationParts.push(option2 && option2.value ? option2.textContent.trim() : 'Без площадки');
      }
    }
    location.textContent = locationParts.join(' · ');
    const notes = [values.note.value.trim()];
    if (isDouble && values.note2.value.trim()) notes.push(values.note2.value.trim());
    note.textContent = hasValue ? notes.filter(Boolean).join(' / ') : '';
    card.classList.toggle('has-value', Boolean(hasValue));
    card.classList.toggle('is-double', isDouble && Boolean(hasValue));
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
    editorStart.value = normalizeTime(values.start.value);
    editorEnd.value = normalizeTime(values.end.value);
    editorLocation.value = values.location.value;
    editorDouble.checked = values.isDouble.value === '1';
    editorStart2.value = normalizeTime(values.start2.value);
    editorEnd2.value = normalizeTime(values.end2.value);
    editorLocation2.value = values.location2.value;
    editorNote.value = values.note.value;
    editorNote2.value = values.note2.value;
    editorTitle.textContent = cell.dataset.groupLabel;
    editorDate.textContent = cell.dataset.dateLabel;
    copyButton.disabled = Number(cell.dataset.day) <= 1;
    syncSecondShiftVisibility();
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

  function validateShift(start, end, label) {
    if (Boolean(start) !== Boolean(end)) {
      window.alert('Укажите и начало, и окончание ' + label + '.');
      return false;
    }
    if (start && end && start >= end) {
      window.alert('Время окончания ' + label + ' должно быть позже начала.');
      return false;
    }
    return true;
  }

  function validateEditor() {
    if (!validateShift(editorStart.value, editorEnd.value, 'первой смены')) return false;
    if (editorDouble.checked) {
      if (!editorStart.value || !editorEnd.value) {
        window.alert('Для двойного занятия укажите первую смену.');
        return false;
      }
      if (!editorStart2.value || !editorEnd2.value) {
        window.alert('Для двойного занятия укажите вторую смену.');
        return false;
      }
      if (!validateShift(editorStart2.value, editorEnd2.value, 'второй смены')) return false;
    }
    return true;
  }

  function snapshot(values) {
    return [
      values.start.value,
      values.end.value,
      values.location.value,
      values.isDouble.value,
      values.start2.value,
      values.end2.value,
      values.location2.value,
      values.note.value,
      values.note2.value,
    ].join('\u0000');
  }

  form.addEventListener('click', function (event) {
    const card = event.target.closest('.schedule-slot-card');
    if (card) openEditor(card.closest('.schedule-admin-cell'));
  });

  editorLocation.addEventListener('change', updateEditorColor);
  editorDouble.addEventListener('change', syncSecondShiftVisibility);

  dialog.querySelector('.schedule-editor__close').addEventListener('click', closeEditor);
  dialog.querySelector('.schedule-editor__cancel').addEventListener('click', closeEditor);

  dialog.querySelector('.schedule-editor__clear').addEventListener('click', function () {
    editorStart.value = '';
    editorEnd.value = '';
    editorLocation.value = '';
    editorDouble.checked = false;
    editorStart2.value = '';
    editorEnd2.value = '';
    editorLocation2.value = '';
    editorNote.value = '';
    editorNote2.value = '';
    syncSecondShiftVisibility();
    updateEditorColor();
  });

  copyButton.addEventListener('click', function () {
    if (!activeCell) return;
    const previous = form.querySelector(
      `.schedule-admin-cell[data-day="${Number(activeCell.dataset.day) - 1}"][data-group="${activeCell.dataset.group}"]`
    );
    if (!previous) return;
    const source = fields(previous);
    editorStart.value = normalizeTime(source.start.value);
    editorEnd.value = normalizeTime(source.end.value);
    editorLocation.value = source.location.value;
    editorDouble.checked = source.isDouble.value === '1';
    editorStart2.value = normalizeTime(source.start2.value);
    editorEnd2.value = normalizeTime(source.end2.value);
    editorLocation2.value = source.location2.value;
    editorNote.value = source.note.value;
    editorNote2.value = source.note2.value;
    syncSecondShiftVisibility();
    updateEditorColor();
  });

  dialog.querySelector('.schedule-editor__apply').addEventListener('click', function () {
    if (!activeCell || !validateEditor()) return;
    const values = fields(activeCell);
    const before = snapshot(values);
    const isDouble = editorDouble.checked;
    values.start.value = normalizeTime(editorStart.value);
    values.end.value = normalizeTime(editorEnd.value);
    values.location.value = editorLocation.value;
    values.isDouble.value = isDouble ? '1' : '';
    values.start2.value = isDouble ? normalizeTime(editorStart2.value) : '';
    values.end2.value = isDouble ? normalizeTime(editorEnd2.value) : '';
    values.location2.value = isDouble ? editorLocation2.value : '';
    values.note.value = editorNote.value.trim();
    values.note2.value = isDouble ? editorNote2.value.trim() : '';
    const after = snapshot(values);
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
