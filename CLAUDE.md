# ВМАС — Виртуальный музей архитектуры Сочи

Цифровая платформа архитектурного наследия Сочи: интерактивная карта зданий (существующих и утраченных), 3D-модели, вики-энциклопедия, нейрохроники (AI-реставрация исторических фотографий).

## Стек

**Никаких систем сборки.** Чистый vanilla JS + HTML + CSS, все зависимости через CDN.

| Зависимость | Версия | Назначение |
|---|---|---|
| MapLibre GL | 4.1.2 | Интерактивная карта с эффектами 3D |
| Google Model Viewer | latest | 3D-просмотрщик + AR |
| Marked.js | latest | Рендеринг Markdown в вики |
| Material Symbols Outlined | — | Иконки (Google Fonts) |
| Tenor Sans | — | Шрифт (Google Fonts) |

Тайлы карты: **MapTiler API** (ключ в `CONFIG.mapTilerKey` в `app.js`).

## Файловая структура

```
vmas/
├── index.html              # Вся HTML-разметка (597 строк)
├── app.js                  # Весь JS (1945 строк)
├── style.css               # Вся стилизация (2856 строк)
├── manifest.json           # PWA-манифест
├── data/
│   ├── objects.json        # Здания, скульптуры, 3D-объекты (6 объектов)
│   ├── architects.json     # Архитекторы (3 записи)
│   ├── neurochronicles.json # Нейрохроники (3 хроники)
│   └── wiki/              # Markdown-статьи (8 статей)
└── assets/
    ├── models/            # 3D-модели (.glb) — 2 модели
    ├── photos/            # Фото объектов, архитекторов, нейрохроник (~20 файлов)
    └── icons/             # PWA-иконки
```

## Запуск

Нужен локальный HTTP-сервер (fetch не работает через `file://`):

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# VS Code: Live Server (расширение)
```

Открыть `http://localhost:8000`.

---

## Архитектура приложения

### CONFIG и STATE

`app.js` начинается с двух глобальных объектов:

```js
const CONFIG = {
  mapTilerKey: '...',       // API-ключ MapTiler
  center: [39.7200, 43.5845], // Центр карты (Сочи)
  zoom: 14,
  bearing: 0,               // Поворот карты (0-360°)
  pitch: 0,                 // Наклон карты 2D (0-60°)
  pitch3d: 50,              // Наклон для 3D-режима
  previewZoomIn: 14.5,      // Порог переключения маркеров в preview-режим
  previewZoomOut: 14.35,    // Порог выключения preview-режима
  splashDuration: 2000,     // Длительность splash-экрана (мс)
};

const STATE = {
  map: null,                // Экземпляр MapLibre GL
  markers: [],              // Спрайты маркеров на карте
  userMarker: null,         // Маркер текущей геолокации
  watchId: null,            // ID для Geolocation API watch
  
  objects: [],              // Загруженные объекты (здания, скульптуры, 3D)
  architects: [],           // Загруженные архитекторы
  neurochronicles: [],      // Загруженные нейрохроники
  mapItems: [],             // Единый список всего на карте (объекты + нейрохроники)
  
  currentObject: null,      // Текущий выбранный объект
  currentViewer3d: null,    // Текущая 3D-модель в просмотрщике
  viewer3dIndex: 0,         // Индекс в галерее 3D
  viewer3dFrom: '3d',       // откуда открыли 3D ('3d' или 'map')
  
  neuroFrom: 'map',         // Откуда открыли нейрохронику ('map' или '3d-gallery')
  neuroIndex: 0,            // Индекс в галерее нейрохроник
  neuroCompareMode: false,  // Режим сравнения оригинала/реставрации
  neuroMagnifyMode: false,  // Режим лупы для нейрохроник
  lastNeuro: null,          // Последняя открытая нейрохроника
  
  wikiFrom: 'map',          // Откуда открыли вики-статью
  
  activeTab: 'map',         // Активная вкладка ('home' | 'map' | 'wiki' | '3d')
  activeBottomSheet: null,  // Открытая bottom-sheet панель
  legendVisible: false,     // Видна ли легенда на карте
  markerPreviewMode: false, // Preview-режим маркеров при приближении
  mapReady: false,          // Карта инициализирована
  isDark: false,            // Активна ли тёмная тема
  is3d: false,              // Карта в режиме 3D (pitch > 0)
};
```

### Экраны и таббар

Приложение состоит из **экранов** (`<section class="screen">`). Активен один за раз.

| ID экрана | Вкладка | Описание |
|---|---|---|
| `screen-home` | `home` | Лендинг о проекте |
| `screen-map` | `map` | Карта (по умолчанию активна) |
| `screen-wiki` | `wiki` | Вики-энциклопедия |
| `screen-3d-gallery` | `3d` | Сетка 3D-моделей |
| `screen-3d-viewer` | — | Полноэкранный 3D-просмотрщик |
| `screen-neuro` | — | Просмотрщик нейрохроник |

**Навигация:**
- `switchTab(tab)` — переключает вкладку, показывает нужный экран
- `switchScreen(name)` — напрямую показывает экран по ID (`screen-{name}`)
- Top bar и tab bar скрываются на экранах `3d-viewer` и `neuro`

**Добавить новую вкладку:**
1. Кнопка в `index.html` внутри `<nav class="tab-bar">` с `data-tab="имя"`
2. Секция `<section id="screen-имя" class="screen">` в `index.html`
3. Ветка `else if (tab === 'имя')` в `switchTab()` в `app.js`
4. Обновить ширину индикатора в `style.css`: `width: calc((100% - 16px) / N)` где N — количество вкладок

### Загрузка данных

Данные загружаются однократно при старте через `loadData()` → `Promise.all([fetch(...)])`. После загрузки `STATE.objects`, `STATE.architects`, `STATE.neurochronicles` заполнены и не меняются.

### Хелперы

| Функция | Назначение |
|---|---|
| `$(id)` | `document.getElementById(id)` |
| `show(el)` / `hide(el)` | toggle класса `hidden` |
| `typeColor(type)` | цвет маркера по типу объекта |
| `typeBadgeLabel(type)` | русское название типа (Здание, 3D, Нейрохроника, Скульптура) |
| `statusLabel(status)` | русское название статуса (Существует, Утрачен, Реставрирован, Реконструирован) |
| `findArchitect(id)` | поиск архитектора по ID |
| `getAuthorIds(item)` | получить ID авторов объекта (поддерживает `author_ids` и `architect_id`) |
| `getAuthors(item)` | получить объекты архитекторов для элемента |
| `hexToRgba(hex, a)` | преобразование hex-цвета в rgba |
| `getPrimaryImage(item)` | получить главное фото объекта или нейрохроники |
| `getItemYear(item)` | получить год (поддерживает `year_built` и `year`) |
| `getItemMeta(item)` | получить метаданные для отображения (год, автор, стиль) |
| `loadMarkdown(slug)` | загружает `data/wiki/{slug}.md` |
| `updateHomeStats()` | обновляет счётчики на home-экране |
| `updateTabIndicator()` | обновляет позицию индикатора активной вкладки |
| `updateTopBarTitle(tab)` | обновляет заголовок в top bar в зависимости от вкладки |

---

## Данные

### Типы объектов (`objects.json`)

| Поле | Тип | Описание |
|---|---|---|
| `id` | string | Уникальный ID |
| `type` | `'3d'` \| `'building'` \| `'sculpture'` | Тип объекта |
| `title` | string | Название |
| `short_desc` | string | Краткое описание (используется как фоллбэк если wiki-статья отсутствует) |
| `lat`, `lng` | number | Координаты на карте |
| `year_built` | string | Год постройки |
| `author_ids` | string[] | ID архитекторов из `architects.json` |
| `style` | string \| null | Архитектурный стиль (Советский модернизм, Сталинский ампир и т.д.) |
| `status` | `'exists'` \| `'gone'` \| `'restored'` \| `'reconstructed'` | Состояние объекта |
| `model_url` | string \| null | Путь к `.glb`-файлу (только для type `'3d'`) |
| `poster_url` | string | Главное фото для карточки объекта |
| `wiki_slug` | string | Slug статьи в `data/wiki/` (без расширения `.md`) |
| `gallery` | string[] | Массив путей к фотографиям галереи |
| `chronicle_ids` | string[] | ID связанных нейрохроник из `neurochronicles.json` |

### Нейрохроники (`neurochronicles.json`)

| Поле | Тип | Описание |
|---|---|---|
| `id` | string | Уникальный ID |
| `title` | string | Название нейрохроники |
| `short_desc` | string | Краткое описание |
| `lat`, `lng` | number | Координаты на карте |
| `year` | string | Год фотографии |
| `status` | `'exists'` \| `'gone'` | Состояние объекта на момент съёмки |
| `photo_original` | string | ЧБ оригинал (путь) |
| `photo_restored` | string | AI-реставрация/цветизированное фото (путь) |
| `source_url` / `source_label` | string | Источник фотографии (ссылка + текст) |
| `wiki_slug` | string | Slug статьи в вики |
| `object_ids` | string[] | ID связанных объектов из `objects.json` |

### Архитекторы (`architects.json`)

Поля: `id`, `name`, `years`, `bio`, `wiki_slug`, `photo`.

### Wiki-статьи (`data/wiki/`)

Файлы Markdown, имя файла = `wiki_slug` объекта. Рендерятся через `marked.parse()`.  
Если файл отсутствует — используется `short_desc` объекта как фоллбэк.

**Добавить новый объект:**
1. Добавить запись в `data/objects.json`
2. Добавить фото в `assets/photos/`
3. Создать `data/wiki/{slug}.md` со статьёй
4. Если type `'3d'` — добавить `.glb` в `assets/models/`

---

## Дизайн-система (style.css)

### CSS-переменные

Все цвета, размеры и эффекты через переменные в `:root`. Тёмная тема — `body.dark` переопределяет переменные. **Никогда не хардкодить цвета напрямую.**

Ключевые переменные:
```css
--bg, --surface, --text, --text-muted   /* Цвета фона и текста */
--accent                                 /* Основной акцент (#4A9EE0) */
--neuro                                  /* Цвет нейрохроник (#F59E0B) */
--sculpture                              /* Цвет скульптур (#A78BFA) */
--glass-bg, --glass-border, --glass-blur /* Glassmorphism */
--radius-pill, --radius-lg, --radius-md, --radius-sm
--tb-h: 56px                             /* Высота top bar */
--tab-h: 68px                            /* Высота tab bar */
--transition                             /* Стандартная анимация */
```

### Glassmorphism

Класс `.glass` применяется к плавающим панелям: полупрозрачный фон + `backdrop-filter: blur(22px)` + тонкая граница. Работает в обеих темах автоматически через переменные.

### Структура CSS

Секции пронумерованы комментариями `/* ── N. НАЗВАНИЕ ── */`:
1. VARIABLES
2. RESET & BASE
3. GLASS
4. SPLASH
5. TOP BAR
6. TAB BAR
7. MAP SCREEN
8. LEGEND
9. BOTTOM SHEET / OBJECT CARD
10. NEURO SCREEN
11. 3D GALLERY
12. 3D VIEWER
13. WIKI SCREEN
14. WIKI ARTICLE
15. ARTICLE SHEET
16. HOME SCREEN
17. MATERIAL ICONS
18. DARK THEME
19. DESKTOP (media queries)

**При добавлении нового экрана** — создавать новую пронумерованную секцию.

---

## Цвета маркеров на карте

| Тип | Цвет | Hex |
|---|---|---|
| `neuro` | Янтарный | `#F59E0B` |
| `3d` | Синий | `#4A9EE0` |
| `building` | Серый | `#6B7280` |
| `sculpture` | Фиолетовый | `#A78BFA` |

Объекты со статусом `gone` отображаются с `opacity: 0.45`.

---

## Важные нюансы

- **API-ключ MapTiler** хардкоден в `CONFIG.mapTilerKey`. Перед публикацией ограничить по домену в панели MapTiler.
- **Порядок вкладок** в таббаре: Главная → Карта → Вики → 3D. При изменении количества вкладок — обновить `width: calc((100% - 16px) / N)` для `.tab-indicator` в style.css.
- **`updateTabIndicator()`** работает динамически (читает DOM), изменений в JS не требует при добавлении вкладок.
- **`updateTopBarTitle()`** автоматически обновляет заголовок в top bar в зависимости от активной вкладки.
- **Нет service worker** — PWA-манифест есть, офлайн-режим не реализован.
- Экраны `3d-viewer` и `neuro` скрывают top bar и tab bar (полноэкранный режим).
- **Легенда на карте** — открывается кнопкой `btn-legend-toggle`, отображает фильтры по типам объектов. На десктопе открывается автоматически.
- **Геолокация** — кнопка `btn-geolocate` запрашивает разрешение и показывает текущую позицию на карте.
- **3D-режим карты** — активируется при наклоне карты (pitch > 0) кнопкой компаса `btn-compass`.
- **Preview-режим маркеров** — при приближении (zoom > 14.5) маркеры переключаются с простых точек на preview-карточки.
- **Связь объектов и нейрохроник** — через `chronicle_ids` в объектах и `object_ids` в нейрохониках.
- `STATE.mapItems = [...objects, ...neurochronicles]` — единый список всего, что есть на карте.
