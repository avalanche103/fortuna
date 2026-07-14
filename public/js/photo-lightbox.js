(function () {
  const lightbox = document.getElementById('photo-lightbox');
  if (!lightbox) return;

  const imageEl = document.getElementById('lightbox-image');
  const albumEl = document.getElementById('lightbox-album');
  const counterEl = document.getElementById('lightbox-counter');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');
  const grid = document.getElementById('photo-grid');

  let current = null;
  let prev = null;
  let next = null;
  let loading = false;

  function photoUrl(photo) {
    return `/foto/${photo.year}/${photo.albumSlug}?photo=${photo.id}`;
  }

  function updateUi() {
    if (!current) return;
    imageEl.src = current.filename;
    imageEl.alt = current.caption || current.albumTitle;
    albumEl.textContent = `${current.year} · ${current.albumTitle}`;
    counterEl.textContent = `${current.position} / ${current.total}`;
    prevBtn.disabled = !prev;
    nextBtn.disabled = !next;
    prevBtn.classList.toggle('is-disabled', !prev);
    nextBtn.classList.toggle('is-disabled', !next);
    if (next) {
      const preload = new Image();
      preload.src = next.filename;
    }
  }

  function openLightbox() {
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
    const url = new URL(window.location.href);
    url.searchParams.delete('photo');
    history.replaceState({}, '', url.pathname + url.search);
  }

  async function loadPhoto(id, pushState) {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch(`/api/foto/photo/${id}`);
      if (!response.ok) throw new Error('Photo not found');
      const data = await response.json();
      current = data.current;
      prev = data.prev;
      next = data.next;
      updateUi();
      openLightbox();
      const url = photoUrl(current);
      if (pushState) history.pushState({ photoId: current.id }, '', url);
      else history.replaceState({ photoId: current.id }, '', url);
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function goPrev() {
    if (prev) loadPhoto(prev.id, true);
  }

  function goNext() {
    if (next) loadPhoto(next.id, true);
  }

  if (grid) {
    grid.addEventListener('click', (event) => {
      const link = event.target.closest('[data-photo-id]');
      if (!link) return;
      event.preventDefault();
      const id = parseInt(link.getAttribute('data-photo-id') || '', 10);
      if (id) loadPhoto(id, true);
    });
  }

  lightbox.querySelectorAll('[data-lightbox-close]').forEach((el) => {
    el.addEventListener('click', closeLightbox);
  });
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') goPrev();
    if (event.key === 'ArrowRight') goNext();
  });

  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const id = parseInt(params.get('photo') || '', 10);
    if (id) loadPhoto(id, false);
    else if (!lightbox.hidden) {
      lightbox.hidden = true;
      document.body.classList.remove('lightbox-open');
    }
  });

  const startId = parseInt(new URLSearchParams(window.location.search).get('photo') || '', 10);
  if (startId) loadPhoto(startId, false);
})();
