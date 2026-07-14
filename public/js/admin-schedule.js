(function () {
  const form = document.getElementById('schedule-form');
  if (!form) return;

  const dirtyLabel = document.getElementById('schedule-dirty');
  let dirty = false;

  function fields(cell) {
    return {
      start: cell.querySelector('input[type="time"]:first-of-type'),
      end: cell.querySelector('input[type="time"]:nth-of-type(2)'),
      location: cell.querySelector('select'),
      note: cell.querySelector('input[type="text"]'),
    };
  }

  function updateCell(cell) {
    const values = fields(cell);
    const details = cell.querySelector('.schedule-slot');
    const summary = cell.querySelector('.schedule-slot__summary');
    const dot = cell.querySelector('.schedule-slot__dot');
    const hasValue = values.start.value || values.end.value || values.location.value || values.note.value.trim();
    summary.textContent = values.start.value
      ? values.start.value + (values.end.value ? '–' + values.end.value : '')
      : (hasValue ? 'Настроено' : '—');
    const option = values.location.selectedOptions[0];
    dot.style.setProperty('--slot-color', option && option.dataset.color ? option.dataset.color : '#cbd5e1');
    details.classList.toggle('has-value', Boolean(hasValue));
  }

  function markDirty() {
    dirty = true;
    if (dirtyLabel) dirtyLabel.textContent = 'Есть несохранённые изменения';
  }

  form.addEventListener('input', function (event) {
    const cell = event.target.closest('td[data-day]');
    if (cell) updateCell(cell);
    markDirty();
  });

  form.addEventListener('change', function (event) {
    const cell = event.target.closest('td[data-day]');
    if (cell) updateCell(cell);
    markDirty();
  });

  form.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button) return;
    const cell = button.closest('td[data-day]');
    if (!cell) return;

    if (button.classList.contains('schedule-slot__clear')) {
      const values = fields(cell);
      values.start.value = '';
      values.end.value = '';
      values.location.value = '';
      values.note.value = '';
      updateCell(cell);
      markDirty();
    }

    if (button.classList.contains('schedule-slot__copy')) {
      const previous = form.querySelector(
        `td[data-day="${Number(cell.dataset.day) - 1}"][data-group="${cell.dataset.group}"]`
      );
      if (!previous) return;
      const source = fields(previous);
      const target = fields(cell);
      target.start.value = source.start.value;
      target.end.value = source.end.value;
      target.location.value = source.location.value;
      target.note.value = source.note.value;
      updateCell(cell);
      markDirty();
    }
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
