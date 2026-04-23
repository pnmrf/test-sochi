  'use strict';

  // ── CONFIG ──────────────────────────────────
  const CONFIG = {
  mapTilerKey: 'shLREE7vwKsTx2aQDPjI',
  center: [39.7200, 43.5845],
  zoom: 14,
  pitch: 0,
  bearing: 0,
  pitch3d: 50,
  previewZoomIn: 14.5,
  previewZoomOut: 14.35,
  splashDuration: 2000,
  };

  // ── STATE ──────────────────────────────────
  const STATE = {
    map: null,
    markers: [],
    userMarker: null,
    watchId: null,
    isDark: false,
    is3d: false,

    objects: [],
    architects: [],
    neurochronicles: [],
    mapItems: [],

    currentObject: null,
    currentViewer3d: null,
    viewer3dIndex: 0,
    viewer3dFrom: '3d',
    activeTab: 'map',
    neuroFrom: 'map',
    neuroIndex: 0,
    neuroCompareMode: false,
    neuroMagnifyMode: false,
    lastNeuro: null,
    wikiFrom: 'map',
    legendVisible: false,
    activeBottomSheet: null,
    mapReady: false,
    markerPreviewMode: false,
  };

  // ── HELPERS ─────────────────────────────────
  const $ = id => document.getElementById(id);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');

  function typeColor(type) {
    return { neuro: '#F59E0B', '3d': '#4A9EE0', building: '#6B7280', sculpture: '#A78BFA' }[type] || '#6B7280';
  }

  function typeBadgeLabel(type) {
    return { neuro: 'Нейрохроника', '3d': '3D', building: 'Здание', sculpture: 'Скульптура' }[type] || '';
  }

  function statusLabel(status) {
  return {
    exists: 'Существует',
    gone: 'Утрачен',
    restored: 'Реставрирован',
    reconstructed: 'Реконструирован'
  }[status] || '—';
}

  function findArchitect(id) {
    return STATE.architects.find(a => a.id === id) || null;
  }

  function getAuthorIds(item) {
    if (Array.isArray(item?.author_ids)) return item.author_ids.filter(Boolean);
    if (item?.architect_id) return [item.architect_id];
    return [];
  }

  function getAuthors(item) {
    return getAuthorIds(item)
      .map(findArchitect)
      .filter(Boolean);
  }

  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function getPrimaryImage(item) {
    return item.poster_url || item.photo_restored || '';
  }

  function getItemYear(item) {
    return item.year_built || item.year || '';
  }

  function getItemMeta(item) {
    return [getItemYear(item), item.style].filter(Boolean).join(' · ');
  }

  function renderItemTags(containerId, item) {
    const container = $(containerId);
    if (!container) return;
    const tags = [];
    const year = getItemYear(item);
    if (year) tags.push(year);
    getAuthors(item).forEach(a => tags.push(a.name));
    container.innerHTML = tags.map(t => `<span class="sc-tag">${t}</span>`).join('');
    container.style.display = tags.length ? '' : 'none';
  }

  function isNeuro(item) {
    return item.type === 'neuro';
  }

  function getAllWikiItems() {
    return [...STATE.objects, ...STATE.neurochronicles];
  }

  function normalizeNeurochronicle(item) {
    return {
      ...item,
      type: 'neuro',
    };
  }

  function getArchitectObjects(archId) {
    return STATE.objects.filter(obj => getAuthorIds(obj).includes(archId));
  }

  function renderAuthorList(containerId, item) {
    const container = $(containerId);
    if (!container) return;

    const authors = getAuthors(item);

    if (!authors.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    container.innerHTML = authors.map(author => `
      <button class="sc-architect" type="button" data-slug="${author.wiki_slug}">
        <span class="material-symbols-outlined">person</span>
        <span>${author.name}</span>
      </button>
    `).join('');

    container.querySelectorAll('[data-slug]').forEach(btn => {
      btn.addEventListener('click', () => {
        openWikiArticle(btn.dataset.slug, 'architects');
      });
    });
  }

  function authorNames(item) {
    const authors = getAuthors(item);
    return authors.length ? authors.map(a => a.name).join(', ') : '—';
  }

  // ── SPLASH ──────────────────────────────────
  function initSplash() {
    const splash = $('splash');
    const app = $('app');

    app.classList.remove('hidden');
    show(app);

    initMap();

    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        hide(splash);
      }, 700);
    }, CONFIG.splashDuration);
  }

  // ── DATA LOAD ──────────────────────────────
  async function loadData() {
    const [objRes, archRes, neuroRes] = await Promise.all([
      fetch('data/objects.json'),
      fetch('data/architects.json'),
      fetch('data/neurochronicles.json'),
    ]);

    STATE.objects = await objRes.json();
    STATE.architects = await archRes.json();
    STATE.neurochronicles = (await neuroRes.json()).map(normalizeNeurochronicle);

    STATE.mapItems = [...STATE.objects, ...STATE.neurochronicles];
  }

  async function loadMarkdown(slug) {
    try {
      const res = await fetch(`data/wiki/${slug}.md`);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  // ── MAP ─────────────────────────────────────
  function initMap() {
    loadData().then(() => {
      const container = $('map-container');

      STATE.map = new maplibregl.Map({
        container,
        style: `https://api.maptiler.com/maps/${STATE.isDark ? 'dataviz-dark' : 'dataviz-light'}/style.json?key=${CONFIG.mapTilerKey}`,
        center: CONFIG.center,
        zoom: CONFIG.zoom,
        fadeDuration: 500,
        pitch: CONFIG.pitch,
        bearing: CONFIG.bearing,
        attributionControl: false,
        dragPan: true,
        dragRotate: true,
        scrollZoom: true,
        touchZoomRotate: true,
        doubleClickZoom: true,
        keyboard: true,
      });

      STATE.map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-right'
      );

      STATE.map.on('load', () => {
  STATE.mapReady = true;
  STATE.map.resize();
  STATE.markerPreviewMode = STATE.map.getZoom() >= CONFIG.previewZoomIn;

  hidePOI();
  placeMarkers();
  updateMarkerVisibility();
  updateBaseLabelsVisibility();

  initWikiNav();
  initWikiSearch();
  updateHomeStats();

  setTimeout(() => {
    const attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) attrib.classList.remove('maplibregl-compact-show');
  }, 100);
});

      // ResizeObserver следит за изменением размера контейнера карты
      // (смена ориентации, переключение вкладок) вместо слепых setTimeout
      const _mapResizeObs = new ResizeObserver(() => {
        if (STATE.map) STATE.map.resize();
      });
      _mapResizeObs.observe($('map-container'));

      STATE.map.on('zoom', () => {
        updateMarkerVisibility();
        updateBaseLabelsVisibility();
      });

      STATE.map.on('move', () => {
        updateMarkerVisibility();
      });

      STATE.map.on('click', e => {
        if (
          !e.originalEvent.target.closest('.map-marker') &&
          !e.originalEvent.target.closest('.marker-preview')
        ) {
          closeCards();
        }
      });
    });
  }

  function hidePOI() {
    const m = STATE.map;
    if (!m || !m.getStyle()) return;

    const hidden = [
      'bar',
      'cafe',
      'restaurant',
      'pharmacy',
      'shop',
      'supermarket',
      'convenience'
    ];

    m.getStyle().layers.forEach(l => {
      if (l.type === 'symbol' && l.layout && l.layout['text-field']) {
        const src = (l['source-layer'] || '').toLowerCase();
        const id = (l.id || '').toLowerCase();

        if (hidden.some(h => src.includes(h) || id.includes(h))) {
          m.setLayoutProperty(l.id, 'visibility', 'none');
        }
      }
    });
  }

  // ── MARKERS ─────────────────────────────────
  function clearMarkers() {
    STATE.markers.forEach(({ dotMarker, prevMarker }) => {
      if (dotMarker) dotMarker.remove();
      if (prevMarker) prevMarker.remove();
    });
    STATE.markers = [];
  }

  function placeMarkers() {
    clearMarkers();

    STATE.mapItems.forEach(item => {
      const dot = document.createElement('div');
      dot.className = `map-marker${item.status === 'gone' ? ' gone' : ''}`;
      dot.style.background = typeColor(item.type);
      dot.dataset.id = item.id;
      dot.style.display = 'block';
      dot.addEventListener('click', e => {
        e.stopPropagation();
        openObjectCard(item);
      });

      const dotMarker = new maplibregl.Marker({ element: dot, anchor: 'center' })
        .setLngLat([item.lng, item.lat])
        .addTo(STATE.map);

      const prev = document.createElement('div');
      prev.className = 'marker-preview';
      prev.dataset.id = item.id;
      prev.style.display = 'none';
      prev.style.borderColor = '#ffffff';
      prev.style.boxShadow = `0 4px 16px rgba(0,0,0,0.3), 0 0 0 3px ${typeColor(item.type)}`;

      const img = document.createElement('img');
      // Откладываем загрузку: src выставляется только при переключении в preview-режим
      img.dataset.src = getPrimaryImage(item);
      img.alt = item.title;
      img.onerror = () => {
        img.onerror = null;
        img.style.display = 'none';
      };
      prev.appendChild(img);

      prev.addEventListener('click', e => {
        e.stopPropagation();
        openObjectCard(item);
      });

      const prevMarker = new maplibregl.Marker({ element: prev, anchor: 'center' })
        .setLngLat([item.lng, item.lat])
        .addTo(STATE.map);

      STATE.markers.push({
        obj: item,
        dot,
        dotMarker,
        prev,
        prevMarker,
        filteredVisible: true
      });
    });

    filterMarkers();
  }

  function updateMarkerVisibility() {
    if (!STATE.map) return;

    const zoom = STATE.map.getZoom();

    if (!STATE.markerPreviewMode && zoom >= CONFIG.previewZoomIn) {
      STATE.markerPreviewMode = true;
    } else if (STATE.markerPreviewMode && zoom <= CONFIG.previewZoomOut) {
      STATE.markerPreviewMode = false;
    }

    const showPreview = STATE.markerPreviewMode;

    STATE.markers.forEach(marker => {
      const { dot, prev, filteredVisible } = marker;

      if (!filteredVisible) {
        dot.style.display = 'none';
        prev.style.display = 'none';
        prev.classList.remove('visible');
        return;
      }

      if (showPreview) {
        dot.style.display = 'none';
        // Ленивая загрузка: ставим src только когда превью впервые показывается
        const previewImg = prev.querySelector('img');
        if (previewImg && previewImg.dataset.src && !previewImg.hasAttribute('src')) {
          previewImg.src = previewImg.dataset.src;
        }
        prev.style.display = 'block';
        prev.classList.add('visible');
      } else {
        prev.classList.remove('visible');
        prev.style.display = 'none';
        dot.style.display = 'block';
        dot.style.opacity = '1';
        dot.style.pointerEvents = 'all';
      }
    });
  }

  function filterMarkers() {
    const layerToggles = {};
    document.querySelectorAll('.legend-toggle[data-layer]').forEach(cb => {
      layerToggles[cb.dataset.layer] = cb.checked;
    });

    const filterExists = document.querySelector('.legend-toggle[data-filter="exists"]')?.checked ?? true;
    const filterGone = document.querySelector('.legend-toggle[data-filter="gone"]')?.checked ?? true;

    STATE.markers.forEach(marker => {
      const { obj } = marker;
      const layerOn = layerToggles[obj.type] !== false;
      const statusOn = obj.status === 'exists' ? filterExists : filterGone;

      marker.filteredVisible = layerOn && statusOn;
    });

    updateMarkerVisibility();
  }

  function setLayerVisibilitySafe(layerId, visible) {
    if (!STATE.map) return;
    if (!STATE.map.getLayer(layerId)) return;

    STATE.map.setLayoutProperty(
      layerId,
      'visibility',
      visible ? 'visible' : 'none'
    );
  }

  function updateBaseLabelsVisibility() {
    if (!STATE.map || !STATE.map.isStyleLoaded()) return;

    const zoom = STATE.map.getZoom();
    const showLabels = zoom >= CONFIG.previewZoomIn;

    const style = STATE.map.getStyle();
    if (!style || !style.layers) return;

    style.layers.forEach(layer => {
      if (layer.type !== 'symbol') return;

      const id = layer.id.toLowerCase();

      const isRoadLabel = id.includes('road') && id.includes('label');
      const isPoiLabel = id.includes('poi');
      const isPlaceLabel = id.includes('place');
      const isTransitLabel = id.includes('transit');
      const isNaturalLabel = id.includes('natural');
      const isWaterLabel = id.includes('water') && id.includes('label');

      if (
        isRoadLabel ||
        isPoiLabel ||
        isPlaceLabel ||
        isTransitLabel ||
        isNaturalLabel ||
        isWaterLabel
      ) {
        setLayerVisibilitySafe(layer.id, showLabels);
      }
    });
  }

  // ── OBJECT CARD ─────────────────────────────
  function openObjectCard(obj) {
    STATE.currentObject = obj;

    let primaryLabel = 'Подробнее';
    let primaryIcon = 'menu_book';
    let showWikiBtn = false;
    let openFn = () => obj.wiki_slug && openWikiArticle(obj.wiki_slug, sectionForSlug(obj.wiki_slug));
    let wikiFn = () => obj.wiki_slug && openWikiArticle(obj.wiki_slug, sectionForSlug(obj.wiki_slug));

    if (obj.type === '3d') {
      primaryLabel = 'Смотреть в 3D';
      primaryIcon = 'view_in_ar';
      showWikiBtn = true;
      openFn = () => open3dViewer(obj, 'map');
    } else if (obj.type === 'neuro') {
      primaryLabel = 'Нейрохроника';
      primaryIcon = 'auto_fix_high';
      showWikiBtn = true;
      openFn = () => { STATE.neuroCompareMode = false; openNeuro(obj, 'map'); };
    }

    // Анимация выбранного маркера
    STATE.markers.forEach(m => {
      m.dot.classList.remove('selected');
      m.prev.classList.remove('selected');
    });
    const selectedEntry = STATE.markers.find(m => m.obj.id === obj.id);
    if (selectedEntry) {
      const color = typeColor(obj.type);
      selectedEntry.dot.style.setProperty('--dot-glow', hexToRgba(color, 0.5));
      selectedEntry.dot.classList.add('selected');
      selectedEntry.prev.style.setProperty('--preview-color', color);
      selectedEntry.prev.classList.add('selected');
    }

    const sc = $('sidebar-card');
    if (sc) {
      $('sc-img').src = getPrimaryImage(obj);
      $('sc-badge').textContent = typeBadgeLabel(obj.type);
      $('sc-badge').className = `badge ${obj.type === '3d' ? 'model3d' : obj.type}`;
      renderItemTags('sc-tags', obj);
      $('sc-title').textContent = obj.title;
      $('sc-desc').textContent = obj.short_desc || '';

      $('sc-btn-open').innerHTML = `<span class="material-symbols-outlined">${primaryIcon}</span> ${primaryLabel}`;
      $('sc-btn-open').onclick = openFn;

      if (showWikiBtn) {
        show($('sc-btn-wiki'));
        $('sc-btn-wiki').onclick = wikiFn;
      } else {
        hide($('sc-btn-wiki'));
      }

      sc.classList.remove('hidden');
    }

    const mc = $('mobile-card');
    if (mc) {
      $('mc-img').src = getPrimaryImage(obj);

  const mcBadge = $('mc-badge');
  if (obj.type === '3d') {
    mcBadge.textContent = '3D';
    mcBadge.className = 'badge model3d';
    mcBadge.style.display = '';
  } else {
    mcBadge.textContent = '';
    mcBadge.className = 'badge';
    mcBadge.style.display = 'none';
  }

  $('mc-title').textContent = obj.title;
  $('mc-meta').textContent = getItemMeta(obj);
  $('mc-desc').textContent = obj.short_desc || '';

      $('mc-btn-open').innerHTML = `<span class="material-symbols-outlined">${primaryIcon}</span> ${primaryLabel}`;
      $('mc-btn-open').onclick = openFn;

      if (showWikiBtn) {
        show($('mc-btn-wiki'));
        $('mc-btn-wiki').onclick = wikiFn;
      } else {
        hide($('mc-btn-wiki'));
      }

      renderAuthorList('mc-architect-list', obj);

      mc.classList.remove('hidden');
    }

    STATE.map.flyTo({
    center: [obj.lng, obj.lat],
    zoom: Math.max(STATE.map.getZoom(), CONFIG.previewZoomIn),
    duration: 600,
    });
  }

  function closeCards() {
    $('sidebar-card')?.classList.add('hidden');
    $('mobile-card')?.classList.add('hidden');
    STATE.currentObject = null;
    STATE.markers.forEach(m => {
      m.dot.classList.remove('selected');
      m.prev.classList.remove('selected');
    });
  }

  // ── NEURO ───────────────────────────────────
  function openNeuro(obj, from, preserveEyeMode = false, preserveCompare = false) {
    STATE.neuroFrom = from || 'map';
    STATE.currentObject = obj;
    STATE.lastNeuro = obj;

    const imgEl = $('neuro-img-restored');
    imgEl.onload = null;
    imgEl.src = obj.photo_restored || '';
    const frame = $('neuro-frame');
    if (frame) frame.style.aspectRatio = '';

    // BW/Color загружаем только в compare mode — иначе лишний трафик
    if (STATE.neuroCompareMode) {
      $('neuro-img-color').src = obj.photo_restored || '';
      $('neuro-img-bw').src = obj.photo_original || '';
    }

    $('neuro-info-title').textContent = obj.title;
    $('neuro-info-year').textContent = obj.year || '';

    const eyeTitle = $('neuro-eye-title');
    const eyeYear = $('neuro-eye-year');
    if (eyeTitle) eyeTitle.textContent = obj.title || '';
    if (eyeYear) eyeYear.textContent = obj.year || '';
    $('neuro-info-desc').textContent = obj.short_desc || '';
    $('neuro-info-source').textContent = obj.source_label ? `Источник: ${obj.source_label}` : '';
    $('neuro-info-source').href = obj.source_url || '#';

    if (STATE.neuroCompareMode) {
      hideBottomSheet();
      // active уже сохранён благодаря исправленному hideBottomSheet,
      // но на всякий случай ставим явно:
      $('neuro-btn-info')?.classList.remove('active');
      $('neuro-btn-compare').classList.add('active');
      show($('neuro-compare'));
      hide($('neuro-img-restored'));
      initNeuroSlider(false);
    } else {
      STATE.neuroCompareMode = false;
      hideBottomSheet();
      document.querySelectorAll('.nc-btn').forEach(b => {
        if (b.id === 'neuro-btn-eye' && preserveEyeMode) return;
        if (b.id === 'neuro-btn-magnify' && STATE.neuroMagnifyMode) return;
        b.classList.remove('active');
      });
      show($('neuro-img-restored'));
      hide($('neuro-compare'));
    }

    if (!preserveEyeMode) {
      $('neuro-controls').classList.remove('view-mode');
      $('neuro-btn-eye')?.classList.remove('active');
      $('app').classList.remove('neuro-eye-mode');
    }

    const idx = STATE.neurochronicles.indexOf(obj);
    if (idx !== -1) STATE.neuroIndex = idx;
    updateNeuroCounter();

    // Обновить боковую панель
    updateNeuroSidebar();

    STATE.activeTab = 'neuro';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'neuro'));
    updateTabIndicator();

    switchScreen('neuro');

    // Принудительно добавляем класс
    document.getElementById('app').classList.add('neuro-active');
  }

  function updateNeuroCounter() {
    const counter = $('neuro-counter');
    if (counter) counter.textContent =
      `${STATE.neuroIndex + 1} / ${STATE.neurochronicles.length}`;
  }

  function navigateNeuro(dir) {
    const items = STATE.neurochronicles;
    if (!items.length) return;
    STATE.neuroIndex = (STATE.neuroIndex + dir + items.length) % items.length;
    const isEyeMode = $('neuro-controls').classList.contains('view-mode');
    openNeuro(items[STATE.neuroIndex], STATE.neuroFrom, isEyeMode, STATE.neuroCompareMode);
  }

function toggleNeuroMagnify() {
  const btn = $('neuro-btn-magnify');
  if (!btn) return;
  const isActive = btn.classList.contains('active');
  btn.classList.toggle('active', !isActive);
  STATE.neuroMagnifyMode = !isActive;
  if (isActive) {
    hide($('neuro-magnifier'));
    $('neuro-frame').classList.remove('magnifying');
  }
}

function handleNeuroMagnify(e) {
  if (!STATE.neuroMagnifyMode) return;
  const frame = $('neuro-frame');
  const viewer = $('neuro-viewer');
  const mag = $('neuro-magnifier');
  if (!frame || !viewer || !mag) return;

  const frameRect = frame.getBoundingClientRect();
  const viewerRect = viewer.getBoundingClientRect();

  if (e.clientX < frameRect.left || e.clientX > frameRect.right ||
      e.clientY < frameRect.top || e.clientY > frameRect.bottom) {
    hide(mag);
    frame.classList.remove('magnifying');
    return;
  }

  show(mag);
  frame.classList.add('magnifying');
  mag.style.left = (e.clientX - viewerRect.left) + 'px';
  mag.style.top = (e.clientY - viewerRect.top) + 'px';

  let imgEl, useGrayscale = false;
  if (STATE.neuroCompareMode) {
    const divider = $('neuro-divider');
    const compareEl = $('neuro-compare');
    if (divider && compareEl) {
      const compareRect = compareEl.getBoundingClientRect();
      const dividerPct = parseFloat(divider.style.left) / 100 || 0.5;
      const relX = (e.clientX - compareRect.left) / compareRect.width;
      if (relX < dividerPct) { imgEl = $('neuro-img-bw'); useGrayscale = true; }
      else imgEl = $('neuro-img-color');
    }
  } else {
    imgEl = $('neuro-img-restored');
  }

  if (!imgEl || !imgEl.src) return;

  const magSize = 230;
  const bgW = frameRect.width * 2;
  const bgH = frameRect.height * 2;
  const cx = e.clientX - frameRect.left;
  const cy = e.clientY - frameRect.top;
  const bgX = cx * 2 - magSize / 2;
  const bgY = cy * 2 - magSize / 2;

  mag.style.backgroundImage = `url('${imgEl.src}')`;
  mag.style.backgroundSize = `${bgW}px ${bgH}px`;
  mag.style.backgroundPosition = `-${bgX}px -${bgY}px`;
  mag.style.filter = useGrayscale ? 'grayscale(100%) sepia(10%)' : '';
}

function toggleNeuroEyeMode() {
  const controls = $('neuro-controls');
  const eyeBtn = $('neuro-btn-eye');
  const isEye = controls.classList.contains('view-mode');

  if (isEye) {
    controls.classList.remove('view-mode');
    $('screen-neuro')?.classList.remove('eye-mode');
    $('app').classList.remove('neuro-eye-mode');
    if (eyeBtn) eyeBtn.classList.remove('active');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } else {
    controls.classList.add('view-mode');
    $('screen-neuro')?.classList.add('eye-mode');
    $('app').classList.add('neuro-eye-mode');
    if (eyeBtn) eyeBtn.classList.add('active');
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  }
}

  function openNeuroSidebar() {
    $('neuro-sidebar').classList.add('open');
    $('neuro-overlay').classList.remove('hidden');
    $('screen-neuro')?.classList.add('neuro-sidebar-visible');
  }

  function closeNeuroSidebar() {
    $('neuro-sidebar').classList.remove('open');
    $('neuro-overlay').classList.add('hidden');
    $('screen-neuro')?.classList.remove('neuro-sidebar-visible');
  }

  function toggleNeuroSidebar() {
    const sidebar = $('neuro-sidebar');
    if (!sidebar) return;

    if (sidebar.classList.contains('open')) {
      closeNeuroSidebar();
    } else {
      openNeuroSidebar();
    }
  }

  function updateNeuroSidebar() {
    const current = STATE.currentObject;
    if (!current) return;

    // === Обновить информационный блок (верхний) ===
    const infoHtml = `
      <h3>${current.title || ''}</h3>
      <p><strong>Год:</strong> ${current.year || 'нет данных'}</p>
      <p>${current.short_desc || ''}</p>
      ${current.source_url ? `<a href="${current.source_url}" target="_blank">${current.source_label || 'Источник'}</a>` : ''}
    `;

    const sidebarInfo = $('neuro-sidebar-info');
    if (sidebarInfo) {
      sidebarInfo.innerHTML = infoHtml;
    }

    // === Обновить список нейрохроник (нижний) ===
    const listHtml = STATE.neurochronicles.map((nc, idx) => {
      const isActive = nc === current ? ' active' : '';
      return `<li><button class="ns-list-item${isActive}" data-neuro-idx="${idx}">${nc.title || `Нейрохроника ${idx + 1}`}</button></li>`;
    }).join('');

    const sidebarList = $('neuro-sidebar-list');
    if (sidebarList) {
      sidebarList.innerHTML = listHtml;
    }
  }

function setNeuroMode(mode) {
  const compare = $('neuro-compare');
  const restored = $('neuro-img-restored');
  const compareBtn = $('neuro-btn-compare');

  if (mode === 'compare') {
    if (STATE.neuroCompareMode) {
      compareBtn.classList.remove('active');
      show(restored);
      hide(compare);
      STATE.neuroCompareMode = false;
      return;
    }

    // Загружаем compare-изображения лениво — только при первом включении режима
    const obj = STATE.currentObject;
    if (obj) {
      $('neuro-img-color').src = obj.photo_restored || '';
      $('neuro-img-bw').src = obj.photo_original || '';
    }

    hide(restored);
    show(compare);
    hideBottomSheet();
    compareBtn.classList.add('active');
    STATE.neuroCompareMode = true;
    initNeuroSlider(true);
  }
}

  // ── NEURO SLIDER ────────────────────────────
  let sliderDragging = false;
  let sliderListenersSet = false;

  function initNeuroSlider(resetPosition = false) {
  const divider = $('neuro-divider');
  const before = $('neuro-before');
  const container = $('neuro-compare');
  if (!divider || !before || !container) return;

  function setPos(x) {
    const rect = container.getBoundingClientRect();
    const relX = x - rect.left;
    const pct = Math.min(Math.max(relX / rect.width, 0.02), 0.98);

    before.style.clipPath = `inset(0 ${(1 - pct) * 100}% 0 0)`;
    divider.style.left = `${pct * 100}%`;
  }

  if (!sliderListenersSet) {
    // Drag по divider (вся линия)
    divider.addEventListener('mousedown', e => {
      sliderDragging = true;
      e.preventDefault();
      setPos(e.clientX);
    });

    divider.addEventListener('touchstart', e => {
      sliderDragging = true;
      e.preventDefault();
      setPos(e.touches[0].clientX);
    }, { passive: false });

    // Клик по контейнеру — мгновенный переход
    container.addEventListener('mousedown', e => {
      if (e.target.closest('.neuro-divider')) return;
      sliderDragging = true;
      e.preventDefault();
      setPos(e.clientX);
    });

    container.addEventListener('touchstart', e => {
      if (e.target.closest('.neuro-divider')) return;
      sliderDragging = true;
      setPos(e.touches[0].clientX);
    }, { passive: true });

    // Move
    window.addEventListener('mousemove', e => {
      if (sliderDragging) setPos(e.clientX);
    });

    window.addEventListener('touchmove', e => {
      if (sliderDragging) setPos(e.touches[0].clientX);
    });

    // End
    window.addEventListener('mouseup', () => {
      sliderDragging = false;
    });

    window.addEventListener('touchend', () => {
      sliderDragging = false;
    });

    sliderListenersSet = true;
  }

  if (resetPosition) {
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      setPos(rect.left + rect.width / 2);
    });
  }
}

  // ── NEURO GALLERY ──────────────────────────
  function renderNeuroGallery() {
  const grid = $('neuro-gallery-grid');
  if (!grid) return;

  const items = STATE.neurochronicles;
  grid.innerHTML = '';

  items.forEach(obj => {
    const card = document.createElement('div');
    card.className = 'gallery-card neuro-gallery-card';
    const colorImg = obj.photo_restored || obj.photo_original || '';
    const bwImg = obj.photo_original || obj.photo_restored || '';
    card.innerHTML = `
      <img class="ngc-color" src="${colorImg}" alt="${obj.title || ''}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/photos/placeholder.jpg'" />
      <img class="ngc-bw" src="${bwImg}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/photos/placeholder.jpg'" />
      <div class="gallery-card-overlay" style="z-index:2;">
        <div class="gallery-card-title">${obj.title || ''}</div>
        <div class="gallery-card-year">${obj.year || ''}</div>
      </div>`;

    card.addEventListener('click', () => {
      STATE.neuroCompareMode = false;
      openNeuro(obj, 'neuro');
    });

    grid.appendChild(card);
  });
}

  // ── 3D GALLERY ─────────────────────────────
  function renderGallery() {
    const grid = $('gallery-grid');
    if (!grid) return;

    const items = STATE.objects.filter(o => o.type === '3d');
    grid.innerHTML = '';

    items.forEach(obj => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.innerHTML = `
        <img src="${obj.poster_url || ''}" alt="${obj.title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/photos/placeholder.jpg'" />
        <span class="badge model3d">3D</span>
        <div class="gallery-card-overlay">
          <div class="gallery-card-title">${obj.title}</div>
          <div class="gallery-card-year">${obj.year_built || ''}</div>
        </div>`;

      card.addEventListener('click', () => {
        open3dViewer(obj, '3d');
      });

      grid.appendChild(card);
    });

    const soon = document.createElement('div');
    soon.className = 'gallery-card-soon';
    soon.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span><span>Скоро</span>`;
    grid.appendChild(soon);
  }

  // ── 3D VIEWER ──────────────────────────────
  function open3dViewer(obj, from = null) {
    const items = STATE.objects.filter(o => o.type === '3d');
    STATE.viewer3dIndex = items.findIndex(o => o.id === obj.id);
    if (STATE.viewer3dIndex < 0) STATE.viewer3dIndex = 0;

    STATE.viewer3dFrom = from || STATE.activeTab || '3d';

    loadViewer3d(obj);
    switchScreen('3d-viewer');
  }

  function loadViewer3d(obj) {
    STATE.currentViewer3d = obj;
    $('viewer-title-text').textContent = obj.title;

    const mv = $('model-viewer');
    mv.poster = '';
    mv.cameraOrbit = '0deg 75deg 105%';
    mv.fieldOfView = '30deg';
    mv.src = obj.model_url || '';

    hideBottomSheet();
    document.querySelectorAll('.va-btn').forEach(b => b.classList.remove('active'));

    const items = STATE.objects.filter(o => o.type === '3d');
    const counter = $('viewer-counter');
    if (counter) {
      counter.textContent = `${STATE.viewer3dIndex + 1} / ${items.length}`;
    }
  }

  function openViewerSheet(type) {
    const obj = STATE.currentViewer3d;
    if (!obj) return;

    const btn = document.querySelector(`#va-${type}`);
    if (btn && btn.classList.contains('active')) {
      hideBottomSheet();
      return;
    }

    hideBottomSheet();
    document.querySelectorAll('.va-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (type === 'info') {
      const facts = [
        { label: 'Год постройки', value: obj.year_built || '—' },
        { label: 'Авторы', value: authorNames(obj) },
        { label: 'Стиль', value: obj.style || '—' },
        { label: 'Статус', value: statusLabel(obj.status) },
      ];

      $('vi-title').textContent = obj.title;
      $('vi-facts').innerHTML = facts.map(f => `
        <div class="vi-fact">
          <div class="vi-fact-label">${f.label}</div>
          <div class="vi-fact-value">${f.value}</div>
        </div>
      `).join('');

      openBottomSheet($('viewer-info-sheet'));

    } else if (type === 'article') {
      openViewerArticle(obj);

    } else if (type === 'gallery') {
      const photos = obj.gallery || [obj.poster_url].filter(Boolean);
      $('vg-photos').innerHTML = photos.map(p =>
        `<img src="${p}" alt="${obj.title}" onerror="this.style.display='none'" />`
      ).join('');

      $('vg-photos').querySelectorAll('img').forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src));
      });

      openBottomSheet($('viewer-gallery-sheet'));

    } else if (type === 'ar') {
      const mv = $('model-viewer');
      if (mv.activateAR) mv.activateAR();
    }
  }

  async function openViewerArticle(obj) {
    const sheet = $('viewer-article-sheet');
    if (!sheet) return;

    const titleEl = $('vas-title');
    const bodyEl = $('vas-body');
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = obj.title;
    bodyEl.innerHTML = '<p>Загрузка...</p>';

    openBottomSheet(sheet);

    const md = await loadMarkdown(obj.wiki_slug);
    if (md) {
      bodyEl.innerHTML = marked.parse(md);
    } else {
      bodyEl.innerHTML = `<p>${obj.short_desc || 'Статья не найдена.'}</p>`;
    }
  }

  function openLightbox(src) {
    $('lightbox-img').src = src;
    show($('lightbox'));
  }

  // ── BOTTOM SHEET ─────────────────────────────
  function openBottomSheet(el) {
    if (!el) return;
    if (STATE.activeBottomSheet && STATE.activeBottomSheet !== el) {
      STATE.activeBottomSheet.classList.add('hidden');
    }
    el.classList.remove('hidden');
    STATE.activeBottomSheet = el;
  }

function hideBottomSheet() {
  if (STATE.activeBottomSheet) {
    STATE.activeBottomSheet.classList.add('hidden');
    STATE.activeBottomSheet = null;
  }

  document.querySelectorAll('.va-btn').forEach(b => b.classList.remove('active'));
}

  function initSheetSwipe(sheet) {
    const handle = sheet.querySelector('.bs-handle-wrap');
    if (!handle) return;

    let startY = 0;
    let currentY = 0;
    let dragging = false;

    function setOffset(offset) {
      const y = Math.max(0, offset);
      sheet.style.transition = 'none';
      sheet.style.transform = `translateX(-50%) translateY(${y}px)`;
      sheet.style.opacity = `${Math.max(0.82, 1 - y / 500)}`;
    }

    function resetSheet() {
      sheet.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease';
      sheet.style.transform = 'translateX(-50%) translateY(0)';
      sheet.style.opacity = '1';

      setTimeout(() => {
        sheet.style.transition = '';
        sheet.style.transform = '';
        sheet.style.opacity = '';
      }, 320);
    }

    function closeSheet() {
      sheet.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease';
      sheet.style.transform = 'translateX(-50%) translateY(100%)';
      sheet.style.opacity = '0';

      setTimeout(() => {
        sheet.style.transition = '';
        sheet.style.transform = '';
        sheet.style.opacity = '';
        sheet.classList.add('hidden');

        if (STATE.activeBottomSheet === sheet) {
          STATE.activeBottomSheet = null;
        }

        document.querySelectorAll('.va-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.nc-btn').forEach(b => b.classList.remove('active'));
      }, 280);
    }

    function startDrag(clientY) {
      if (sheet.classList.contains('hidden')) return;
      dragging = true;
      startY = clientY;
      currentY = 0;
    }

    function moveDrag(clientY) {
      if (!dragging) return;
      currentY = Math.max(0, clientY - startY);
      setOffset(currentY);
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;

      if (currentY > 90) {
        closeSheet();
      } else {
        resetSheet();
      }
    }

    handle.addEventListener('touchstart', e => {
      startDrag(e.touches[0].clientY);
    }, { passive: true });

    handle.addEventListener('touchmove', e => {
      if (!dragging) return;
      moveDrag(e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    handle.addEventListener('touchend', endDrag);
    handle.addEventListener('touchcancel', endDrag);

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      startDrag(e.clientY);
    });

    window.addEventListener('mousemove', e => {
      moveDrag(e.clientY);
    });

    window.addEventListener('mouseup', endDrag);
  }

  // ── WIKI ────────────────────────────────────
  const wikiFilters = { lost: true, d3: true, neuro: true };

  function updateCollapseIcon() {
    const icon = $('wiki-collapse-icon');
    if (!icon) return;
    const anyOpen = !!document.querySelector('.ws-section.open');
    icon.textContent = anyOpen ? 'unfold_less' : 'unfold_more';
  }

  function applyWikiFilters() {
    document.querySelectorAll('.ws-list li').forEach(li => {
      const a = li.querySelector('a');
      if (!a) return;
      const isGone   = a.dataset.gone === '1';
      const is3d     = a.dataset.d3 === '1';
      const hasNeuro = a.dataset.neuro === '1';

      let visible = true;
      if (isGone   && !wikiFilters.lost)  visible = false;
      if (is3d     && !wikiFilters.d3)    visible = false;
      if (hasNeuro && !wikiFilters.neuro) visible = false;

      li.style.display = visible ? '' : 'none';
    });
  }

  function initWikiNav() {
    const buildingItems = STATE.objects.filter(o => ['building', '3d'].includes(o.type));
    const neuroItems = STATE.neurochronicles;
    const sculptureItems = STATE.objects.filter(o => o.type === 'sculpture');

    fillWikiList('ws-list-buildings', buildingItems, o => o.wiki_slug, o => o.title, o => o.status, o => o.type, o => o);
    fillWikiList('ws-list-neuro', neuroItems, o => o.wiki_slug, o => o.title, o => o.status, () => '', o => o);
    fillWikiList('ws-list-sculptures', sculptureItems, o => o.wiki_slug, o => o.title, o => o.status, o => o.type, o => o);
    fillWikiArchitects();

    document.querySelectorAll('.ws-section-header').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.ws-section').classList.toggle('open');
        updateCollapseIcon();
      });
    });

    ['wf-lost', 'wf-3d', 'wf-neuro'].forEach(id => {
      const btn = $(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (id === 'wf-lost')  wikiFilters.lost  = btn.classList.contains('active');
        if (id === 'wf-3d')    wikiFilters.d3    = btn.classList.contains('active');
        if (id === 'wf-neuro') wikiFilters.neuro = btn.classList.contains('active');
        applyWikiFilters();
      });
    });
  }

  function fillWikiList(listId, items, slugFn, titleFn, statusFn, typeFn, itemFn) {
  const ul = $(listId);
  if (!ul) return;

  ul.innerHTML = items.map(item => {
    const status   = statusFn(item);
    const type     = typeFn(item);
    const obj      = itemFn(item);
    const isGone   = status === 'gone';
    const is3d     = type === '3d';
    const hasNeuro = !!(obj.chronicle_ids && obj.chronicle_ids.length > 0);

    const badges = [];
    if (is3d)     badges.push('<span class="ws-badge-3d">3D</span>');
    if (hasNeuro) badges.push('<span class="material-symbols-outlined ws-badge-neuro">auto_fix_high</span>');
    if (isGone)   badges.push('<span class="ws-status-dot" title="Утрачен"></span>');
    const badgesHtml = badges.length ? `<span class="ws-item-badges">${badges.join('')}</span>` : '';

    return `<li><a href="#" data-slug="${slugFn(item)}" data-section="${listId.replace('ws-list-','')}" data-id="${item.id}" data-gone="${isGone ? 1 : 0}" data-d3="${is3d ? 1 : 0}" data-neuro="${hasNeuro ? 1 : 0}">
      <span class="ws-link-title">${titleFn(item)}</span>
      ${badgesHtml}
    </a></li>`;
  }).join('');

  ul.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      openWikiArticle(a.dataset.slug, a.dataset.section);
      closeMobileSidebar();
    });
  });
}

  function fillWikiArchitects() {
    const ul = $('ws-list-architects');
    if (!ul) return;

    ul.innerHTML = STATE.architects.map(arch => `
      <li><a href="#" data-slug="${arch.wiki_slug}" data-section="architects">${arch.name}</a></li>
    `).join('');

    ul.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        openWikiArticle(a.dataset.slug, 'architects');
        closeMobileSidebar();
      });
    });
  }

  function sectionForSlug(slug) {
    const a = STATE.architects.find(a => a.wiki_slug === slug);
    if (a) return 'architects';

    const item = getAllWikiItems().find(o => o.wiki_slug === slug);
    if (item) return { neuro: 'neuro', sculpture: 'sculptures', building: 'buildings', '3d': 'buildings' }[item.type] || 'buildings';

    return 'buildings';
  }

  async function openWikiArticle(slug, section) {
    if (!slug) return;

    if (STATE.activeTab !== 'wiki') {
      STATE.wikiFrom = STATE.activeTab;
      switchTab('wiki');
    }

    document.querySelectorAll('.ws-section').forEach(s => {
      const sec = section || sectionForSlug(slug);
      if (s.dataset.section === sec) {
        s.classList.add('open');
      }
    });
    updateCollapseIcon();

    document.querySelectorAll('.ws-list a').forEach(a => {
      a.classList.toggle('active', a.dataset.slug === slug);
    });

    const arch = STATE.architects.find(a => a.wiki_slug === slug);
    const item = getAllWikiItems().find(o => o.wiki_slug === slug);

    hide($('wiki-placeholder'));
    show($('wiki-article'));

    if (arch) {
      await renderWikiArchitect(arch);
    } else if (item) {
      await renderWikiObject(item);
    }

    const area = $('wiki-article-area');
    if (area) area.scrollTop = 0;
  }

  async function renderWikiObject(obj) {
    $('wa-hero').src = getPrimaryImage(obj);
    $('wa-hero').style.display = '';
    $('wa-hero').onerror = () => {
      $('wa-hero').style.display = 'none';
    };

    $('wa-title').textContent = obj.title;
    
    const facts = [
      { label: 'Год', value: getItemYear(obj) || '—' },
      { label: 'Стиль', value: obj.style || '—' },
      { label: 'Авторы', value: isNeuro(obj) ? '—' : authorNames(obj) },
      { label: 'Статус', value: statusLabel(obj.status) },
    ];

    $('wa-facts').innerHTML = facts.map(f => `
      <div>
        <div class="wa-fact-label">${f.label}</div>
        <div class="wa-fact-value">${f.value}</div>
      </div>`).join('');

    const md = await loadMarkdown(obj.wiki_slug);
    $('wa-body').innerHTML = md ? marked.parse(md) : `<p>${obj.short_desc || ''}</p>`;

    const mapBtn = $('wa-map-btn');
    mapBtn.style.display = '';
    show(mapBtn);
    mapBtn.onclick = () => {
      switchTab('map');
      setTimeout(() => {
        if (STATE.map) {
          STATE.map.resize();
          STATE.markerPreviewMode = STATE.map.getZoom() >= CONFIG.previewZoomIn;
          STATE.map.flyTo({ center: [obj.lng, obj.lat], zoom: 15.5, duration: 800 });
          setTimeout(() => openObjectCard(obj), 900);
        }
      }, 100);
    };

    const viewBtn = $('wa-view-btn');
    if (viewBtn) {
      if (obj.type === 'neuro' || obj.type === '3d') {
        show(viewBtn);
        viewBtn.style.display = '';

        if (obj.type === 'neuro') {
          viewBtn.innerHTML = '<span class="material-symbols-outlined">auto_fix_high</span> Посмотреть';
          viewBtn.onclick = () => { STATE.neuroCompareMode = false; openNeuro(obj, 'wiki'); };
        } else {
          viewBtn.innerHTML = '<span class="material-symbols-outlined">view_in_ar</span> 3D модель';
          viewBtn.onclick = () => open3dViewer(obj, 'wiki');
        }
      } else {
        hide(viewBtn);
      }
    }
  }

  async function renderWikiArchitect(arch) {
    $('wa-hero').src = arch.photo || '';
    $('wa-hero').style.display = '';
    $('wa-hero').onerror = () => {
      $('wa-hero').style.display = 'none';
    };

    $('wa-title').textContent = arch.name;
    
    const relatedObjects = getArchitectObjects(arch.id);

    $('wa-facts').innerHTML = `
      <div>
        <div class="wa-fact-label">Годы жизни</div>
        <div class="wa-fact-value">${arch.years || '—'}</div>
      </div>
      <div>
        <div class="wa-fact-label">Объектов в базе</div>
        <div class="wa-fact-value">${relatedObjects.length}</div>
      </div>
    `;

    const md = await loadMarkdown(arch.wiki_slug);
    const worksHtml = relatedObjects.length
      ? `
        <h3>Связанные объекты</h3>
        <p>
          ${relatedObjects.map(obj => `
            <a href="#" class="wiki-inline-object-link" data-slug="${obj.wiki_slug}">
              ${obj.title}
            </a>
          `).join('<br>')}
        </p>
      `
      : '';

    $('wa-body').innerHTML = (md ? marked.parse(md) : `<p>${arch.bio || ''}</p>`) + worksHtml;

    $('wa-body').querySelectorAll('.wiki-inline-object-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        openWikiArticle(link.dataset.slug, sectionForSlug(link.dataset.slug));
      });
    });

    hide($('wa-map-btn'));
    const viewBtn = $('wa-view-btn');
    if (viewBtn) hide(viewBtn);
  }

  function collapseAllWikiSections() {
    const anyOpen = !!document.querySelector('.ws-section.open');
    document.querySelectorAll('.ws-section').forEach(section => {
      if (anyOpen) section.classList.remove('open');
      else section.classList.add('open');
    });
    updateCollapseIcon();
  }

  // ── WIKI SEARCH ─────────────────────────────
  function initWikiSearch() {
    const input = $('wiki-search');
    const results = $('wiki-search-results');
    if (!input || !results) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) {
        hide(results);
        results.innerHTML = '';
        return;
      }

      const allItems = [
        ...getAllWikiItems().map(o => ({
          slug: o.wiki_slug,
          label: o.title,
          section: sectionForSlug(o.wiki_slug),
          type: 'object',
        })),
        ...STATE.architects.map(a => ({
          slug: a.wiki_slug,
          label: a.name,
          section: 'architects',
          type: 'architect',
        })),
      ];

      const matches = allItems.filter(m => m.label && m.label.toLowerCase().includes(q));

      if (!matches.length) {
        results.innerHTML = '<div class="ws-result" style="color:var(--text-muted)">Ничего не найдено</div>';
        show(results);
        return;
      }

      results.innerHTML = matches.slice(0, 8).map(m =>
        `<div class="ws-result" data-slug="${m.slug}" data-section="${m.section}">${m.label}</div>`
      ).join('');
      show(results);

      results.querySelectorAll('.ws-result[data-slug]').forEach(r => {
        r.addEventListener('click', () => {
          openWikiArticle(r.dataset.slug, r.dataset.section);
          hide(results);
          input.value = '';
          closeMobileSidebar();
        });
      });
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.ws-search-wrap') && !e.target.closest('.ws-search-results')) {
        hide(results);
      }
    });
  }

  // ── MOBILE SIDEBAR ───────────────────────────
  function openMobileSidebar() {
  $('wiki-sidebar').classList.add('open');
  $('wiki-overlay').classList.remove('hidden');
  $('screen-wiki')?.classList.add('wiki-sidebar-visible');
}

function closeMobileSidebar() {
  $('wiki-sidebar').classList.remove('open');
  $('wiki-overlay').classList.add('hidden');
  $('screen-wiki')?.classList.remove('wiki-sidebar-visible');
}

function toggleMobileSidebar() {
  const sidebar = $('wiki-sidebar');
  if (!sidebar) return;

  if (sidebar.classList.contains('open')) {
    closeMobileSidebar();
  } else {
    openMobileSidebar();
  }
}

  // ── SCREEN SWITCHING ────────────────────────
    function switchScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    const hideGlobalBars = name === '3d-viewer' || name === 'neuro' || name === 'wiki';
    $('top-bar').style.display = hideGlobalBars ? 'none' : '';
    $('tab-bar').style.display = (name === '3d-viewer') ? 'none' : '';

    // Класс для прозрачности таб-бара в нейрохрониках
    $('app').classList.toggle('neuro-active', name === 'neuro');

    const screen = $(`screen-${name}`);
    if (screen) screen.classList.add('active');

    if (name === 'map' && STATE.map) {
      requestAnimationFrame(() => {
        STATE.map.resize();
        updateMarkerVisibility();
      });
    }
  }

  function updateTabIndicator() {
    const indicator = $('tab-indicator');
    const tabs = Array.from(document.querySelectorAll('#tab-bar .tab'));
    const active = document.querySelector('#tab-bar .tab.active');

    if (!indicator || !tabs.length || !active) return;

    const activeIndex = tabs.indexOf(active);
    if (activeIndex < 0) return;

    indicator.style.transform = `translateX(${activeIndex * 100}%)`;
  }

  function switchTab(tab) {
    STATE.activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    updateTabIndicator();
    updateTopBarTitle();

    $('top-bar').style.display = '';
    $('tab-bar').style.display = '';

    // Сбросить класс нейро-режима при смене вкладки
    $('app').classList.remove('neuro-active');

    hideBottomSheet();

    if (tab === 'map') {
      switchScreen('map');
      if (STATE.map) {
        requestAnimationFrame(() => {
          STATE.map.resize();
          updateMarkerVisibility();
        });
      }
    } else if (tab === 'neuro') {
      if (STATE.lastNeuro) {
        openNeuro(STATE.lastNeuro, 'neuro', false, false);
      } else {
        renderNeuroGallery();
        switchScreen('neuro-gallery');
      }
    } else if (tab === '3d') {
      renderGallery();
      switchScreen('3d-gallery');
    } else if (tab === 'wiki') {
      switchScreen('wiki');
    } else if (tab === 'home') {
      switchScreen('home');
      updateHomeStats();
    }
  }

  function updateTopBarTitle() {
    const title = $('top-bar-title');
    if (!title) return;

    if (STATE.activeTab === '3d') {
      title.textContent = '3D-экспонаты';
    } else if (STATE.activeTab === 'neuro') {
      title.textContent = 'Нейрохроники';
    } else {
      title.textContent = 'ВМАС';
    }
  }

  function updateHomeStats() {
    const s = document.getElementById('stat-objects');
    const m = document.getElementById('stat-models');
    const n = document.getElementById('stat-neuro');
    const a = document.getElementById('stat-architects');
    if (s) s.textContent = STATE.objects.length + STATE.neurochronicles.length;
    if (m) m.textContent = STATE.objects.filter(o => o.type === '3d').length;
    if (n) n.textContent = STATE.neurochronicles.length;
    if (a) a.textContent = STATE.architects.length;
  }

  // ── MAP CONTROLS ─────────────────────────────
  function toggle3D() {
    STATE.is3d = !STATE.is3d;
    STATE.map.easeTo({ pitch: STATE.is3d ? CONFIG.pitch3d : 0, duration: 600 });
  }

  function resetNorth() {
    STATE.map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    STATE.is3d = false;
  }

  function geolocate() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      STATE.map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });

      if (STATE.userMarker) STATE.userMarker.remove();

      const el = document.createElement('div');
      el.style.cssText = 'width:20px;height:20px;background:#006C49;border-radius:50%;border:3px solid white;box-shadow:0 0 0 6px rgba(0,104,73,0.2)';
      STATE.userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(STATE.map);
    });
  }

  // ── THEME ───────────────────────────────────
  function toggleTheme() {
    STATE.isDark = !STATE.isDark;
    document.documentElement.classList.toggle('dark', STATE.isDark);
    localStorage.setItem('vmas-theme', STATE.isDark ? 'dark' : 'light');

    const wikiThemeIconMobile = $('wiki-theme-icon-mobile');
if (wikiThemeIconMobile) {
  wikiThemeIconMobile.textContent = STATE.isDark ? 'light_mode' : 'dark_mode';
}

    const wikiThemeIcon = $('wiki-theme-icon');
if (wikiThemeIcon) {
  wikiThemeIcon.textContent = STATE.isDark ? 'light_mode' : 'dark_mode';
}

    const themeIcon = $('theme-icon');
    if (themeIcon) {
      themeIcon.textContent = STATE.isDark ? 'light_mode' : 'dark_mode';
    }

    const viewerThemeIcon = $('viewer-theme-icon');
    if (viewerThemeIcon) {
      viewerThemeIcon.textContent = STATE.isDark ? 'light_mode' : 'dark_mode';
    }

    const neuroThemeIcon = $('neuro-theme-icon');
    if (neuroThemeIcon) {
      neuroThemeIcon.textContent = STATE.isDark ? 'light_mode' : 'dark_mode';
    }

    const style = STATE.isDark
      ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${CONFIG.mapTilerKey}`
      : `https://api.maptiler.com/maps/dataviz-light/style.json?key=${CONFIG.mapTilerKey}`;

    if (STATE.map) {
      const center = STATE.map.getCenter();
      const zoom = STATE.map.getZoom();
      const bearing = STATE.map.getBearing();
      const pitch = STATE.map.getPitch();

      STATE.map.setStyle(style);
      STATE.map.once('styledata', () => {
        STATE.map.jumpTo({ center, zoom, bearing, pitch });
        hidePOI();
        placeMarkers();
      });
    }
  }

  // ── LEGEND ─────────────────────────────────
  function toggleLegend() {
    const panel = $('legend-panel');
    const btn = $('btn-legend-toggle');

    STATE.legendVisible = !STATE.legendVisible;
    panel.classList.toggle('hidden', !STATE.legendVisible);

    if (btn) {
      btn.classList.toggle('active', STATE.legendVisible);
    }
  }

  // ── EVENTS ──────────────────────────────────
  function initEvents() {
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });

    const wikiCollapseBtn = $('wiki-collapse-all');
if (wikiCollapseBtn) {
  wikiCollapseBtn.addEventListener('click', collapseAllWikiSections);
}

    $('btn-home').addEventListener('click', () => {
      switchTab('home');
    });

    $('btn-reset-view').addEventListener('click', () => {
      if (!STATE.map) return;
      STATE.map.flyTo({
        center: CONFIG.center,
        zoom: CONFIG.zoom,
        pitch: CONFIG.pitch,
        bearing: CONFIG.bearing,
        duration: 900,
      });
    });

    const wikiThemeBtn = $('wiki-theme');
    if (wikiThemeBtn) wikiThemeBtn.addEventListener('click', toggleTheme);

    const neuroThemeBtn = $('neuro-theme');
    if (neuroThemeBtn) neuroThemeBtn.addEventListener('click', toggleTheme);

    const neuroGalleryBtn = $('neuro-btn-gallery');
    if (neuroGalleryBtn) {
      neuroGalleryBtn.addEventListener('click', () => {
        closeNeuroSidebar();
        renderNeuroGallery();
        switchScreen('neuro-gallery');
      });
    }

    const neuroMapBtn = $('neuro-btn-map');
    if (neuroMapBtn) {
      neuroMapBtn.addEventListener('click', () => {
        const obj = STATE.currentObject;
        closeNeuroSidebar();

        // Включить нейрохроники в легенде, если выключены
        const neuroLayerToggle = document.querySelector('.legend-toggle[data-layer="neuro"]');
        if (neuroLayerToggle && !neuroLayerToggle.checked) {
          neuroLayerToggle.checked = true;
          filterMarkers();
        }

        switchTab('map');
        if (obj && obj.lat && obj.lng && STATE.map) {
          STATE.map.flyTo({ center: [obj.lng, obj.lat], zoom: 16, duration: 1200 });
          // После завершения полёта — открыть карточку с анимацией маркера
          setTimeout(() => openObjectCard(obj), 1300);
        }
      });
    }

    $('btn-theme').addEventListener('click', toggleTheme);

    $('btn-compass').addEventListener('click', () => {
      if (STATE.map.getBearing() !== 0 || STATE.map.getPitch() !== 0) resetNorth();
      else toggle3D();
    });

    $('btn-zoom-in').addEventListener('click', () => STATE.map && STATE.map.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => STATE.map && STATE.map.zoomOut());
    $('btn-geolocate').addEventListener('click', geolocate);

    const legendBtn = $('btn-legend-toggle');
    if (legendBtn) legendBtn.addEventListener('click', toggleLegend);

    document.querySelectorAll('.legend-toggle').forEach(cb => {
      cb.addEventListener('change', filterMarkers);
    });

    $('neuro-btn-compare').addEventListener('click', (e) => { e.stopPropagation(); setNeuroMode('compare'); });
    $('neuro-prev').addEventListener('click', (e) => { e.stopPropagation(); navigateNeuro(-1); });
    $('neuro-next').addEventListener('click', (e) => { e.stopPropagation(); navigateNeuro(+1); });
    $('neuro-btn-eye').addEventListener('click', toggleNeuroEyeMode);
    $('neuro-btn-magnify').addEventListener('click', (e) => { e.stopPropagation(); toggleNeuroMagnify(); });

    const neuroViewer = $('neuro-viewer');
    if (neuroViewer) {
      neuroViewer.addEventListener('mousemove', handleNeuroMagnify);
      neuroViewer.addEventListener('mouseleave', () => {
        hide($('neuro-magnifier'));
        $('neuro-frame')?.classList.remove('magnifying');
      });
    }

    // ── NEURO SIDEBAR EVENT HANDLERS ──
    const neuroToggle = $('neuro-sidebar-toggle');
    if (neuroToggle) {
      neuroToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNeuroSidebar();
      });
    }

    const neuroSidebarClose = $('neuro-sidebar-close');
    if (neuroSidebarClose) {
      neuroSidebarClose.addEventListener('click', (e) => {
        e.stopPropagation();
        hideBottomSheet();
        STATE.lastNeuro = null;
        if (STATE.neuroFrom === 'wiki') switchTab('wiki');
        else if (STATE.neuroFrom === 'neuro') {
          renderNeuroGallery();
          switchScreen('neuro-gallery');
        } else switchTab('map');
      });
    }

    const neuroOverlay = $('neuro-overlay');
    if (neuroOverlay) {
      neuroOverlay.addEventListener('click', closeNeuroSidebar);
    }

    // Клики на элементы списка нейрохроник в боковой панели
    document.addEventListener('click', (e) => {
      const item = e.target.closest('.ns-list-item');
      if (!item) return;

      const idx = parseInt(item.getAttribute('data-neuro-idx'), 10);
      if (isNaN(idx)) return;

      STATE.neuroIndex = idx;
      openNeuro(STATE.neurochronicles[idx], STATE.neuroFrom, false, STATE.neuroCompareMode);
    });

    $('viewer-back').addEventListener('click', () => {
      hideBottomSheet();
      switchTab(STATE.viewer3dFrom || '3d');
    });

    $('va-info').addEventListener('click', () => openViewerSheet('info'));
    $('va-article').addEventListener('click', () => openViewerSheet('article'));
    $('va-gallery').addEventListener('click', () => openViewerSheet('gallery'));
    $('va-ar').addEventListener('click', () => openViewerSheet('ar'));

    $('viewer-prev').addEventListener('click', () => {
      const items = STATE.objects.filter(o => o.type === '3d');
      if (!items.length) return;
      STATE.viewer3dIndex = (STATE.viewer3dIndex - 1 + items.length) % items.length;
      loadViewer3d(items[STATE.viewer3dIndex]);
    });

    $('viewer-next').addEventListener('click', () => {
      const items = STATE.objects.filter(o => o.type === '3d');
      if (!items.length) return;
      STATE.viewer3dIndex = (STATE.viewer3dIndex + 1) % items.length;
      loadViewer3d(items[STATE.viewer3dIndex]);
    });

    $('lightbox').addEventListener('click', e => {
      if (e.target === $('lightbox') || e.target === $('lightbox-close') || e.target.closest('.lightbox-close')) {
        hide($('lightbox'));
      }
    });

    $('lightbox-close').addEventListener('click', () => hide($('lightbox')));

    const wikiToggle = $('wiki-sidebar-toggle');
if (wikiToggle) {
  wikiToggle.addEventListener('click', e => {
    const isMobile = window.innerWidth <= 767;
    if (!isMobile) return;

    const themeBtnArea = e.target.closest('.wiki-toggle-left');
    const collapseBtnArea = e.target.closest('.wiki-toggle-right');
    const screenWiki = $('screen-wiki');
    const sidebarOpen = screenWiki?.classList.contains('wiki-sidebar-visible');

    if (sidebarOpen && themeBtnArea) {
      e.stopPropagation();
      toggleTheme();
      return;
    }

    if (sidebarOpen && collapseBtnArea) {
      e.stopPropagation();
      collapseAllWikiSections();
      return;
    }

    toggleMobileSidebar();
  });
}

const wikiOverlay = $('wiki-overlay');
if (wikiOverlay) wikiOverlay.addEventListener('click', closeMobileSidebar);

const articleArea = $('wiki-article-area');
if (articleArea) {
  articleArea.addEventListener('click', () => {
    if (window.innerWidth <= 767 && $('wiki-sidebar')?.classList.contains('open')) {
      closeMobileSidebar();
    }
  });
}

    document.addEventListener('click', e => {
      if (
        STATE.activeBottomSheet &&
        !e.target.closest('.bottom-sheet') &&
        !e.target.closest('.article-sheet') &&
        !e.target.closest('.va-btn') &&
        !e.target.closest('.nc-btn')
      ) {
        hideBottomSheet();
      }
    });

    document.querySelectorAll('.bottom-sheet, .article-sheet').forEach(initSheetSwipe);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (STATE.activeBottomSheet) {
          hideBottomSheet();
        } else if (!$('lightbox').classList.contains('hidden')) {
          hide($('lightbox'));
        }
      }

      if ($('screen-neuro')?.classList.contains('active')) {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateNeuro(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); navigateNeuro(+1); }
      }
    });

    const viewerThemeBtn = $('viewer-theme');
    if (viewerThemeBtn) {
    viewerThemeBtn.addEventListener('click', toggleTheme);
  }

  // В конец функции initEvents() добавить:

  }
  

  // ── INIT ────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('vmas-theme');
    if (savedTheme !== 'light') {
      STATE.isDark = true;
      document.documentElement.classList.add('dark');
      ['theme-icon', 'wiki-theme-icon', 'wiki-theme-icon-mobile', 'viewer-theme-icon', 'neuro-theme-icon'].forEach(id => {
        const el = $(id);
        if (el) el.textContent = 'light_mode';
      });
    }
    initEvents();
    if (window.innerWidth >= 1100) {
      STATE.legendVisible = true;
      $('legend-panel')?.classList.remove('hidden');
      $('btn-legend-toggle')?.classList.add('active');
    }
    initSplash();
    updateTabIndicator();
    updateTopBarTitle();
  });