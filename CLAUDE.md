# ВМАС — Виртуальный музей архитектуры Сочи

Цифровая платформа архитектурного наследия Сочи: интерактивная карта зданий (существующих и утраченных), 3D-модели, вики-энциклопедия, нейрохроники (AI-реставрация исторических фотографий).

## Стек

**Никаких систем сборки.** Чистый vanilla JS + HTML + CSS, все зависимости через CDN.

| Зависимость | Версия | Назначение |
|---|---|---|
| MapLibre GL | 4.1.2 | Интерактивная карта |
| Google Model Viewer | latest | 3D-просмотрщик + AR |
| Marked.js | latest | Рендеринг Markdown |
| Material Symbols Outlined | — | Иконки (Google Fonts) |
| Tenor Sans | — | Шрифт (Google Fonts) |

Тайлы карты: **MapTiler API** (ключ в `CONFIG.mapTilerKey` в `app.js`).

## Файловая структура

```
vmas/
├── index.html              # Вся HTML-разметка, 1 файл
├── app.js                  # Весь JS, 1 файл (~1550 строк)
├── style.css               # Вся стилизация, 1 файл (~2200 строк)
├── manifest.json           # PWA-манифест
├── data/
│   ├── objects.json        # Здания, скульптуры, 3D-объекты
│   ├── architects.json     # Архитекторы
│   ├── neurochronicles.json # Нейрохроники
│   └── wiki/              # Markdown-статьи (slug.md)
└── assets/
    ├── models/            # 3D-модели (.glb)
    ├── photos/            # Фото объектов, архитекторов, нейрохроник
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
  mapTilerKey: '...',   // API-ключ MapTiler
  center: [39.72, 43.5845],  // Центр карты (Сочи)
  zoom: 14,
  pitch3d: 50,
  previewZoomIn: 14.5,  // Порог переключения маркеров в preview-режим
  splashDuration: 2000,
};

const STATE = {
  map: null,            // Экземпляр MapLibre
  objects: [],          // Загруженные объекты
  architects: [],
  neurochronicles: [],
  mapItems: [],         // objects + neurochronicles (все на карте)
  currentObject: null,
  activeTab: 'map',     // 'home' | 'map' | 'wiki' | '3d'
  isDark: false,
  // ...
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
| `typeBadgeLabel(type)` | русское название типа |
| `statusLabel(status)` | русское название статуса |
| `getAuthors(item)` | массив архитекторов объекта |
| `loadMarkdown(slug)` | загружает `data/wiki/{slug}.md` |
| `updateHomeStats()` | обновляет счётчики на home-экране |

---

## Данные

### Типы объектов (`objects.json`)

| Поле | Тип | Описание |
|---|---|---|
| `id` | string | Уникальный ID |
| `type` | `'3d'` \| `'building'` \| `'sculpture'` | Тип |
| `title` | string | Название |
| `short_desc` | string | Краткое описание |
| `lat`, `lng` | number | Координаты |
| `year_built` | string | Год постройки |
| `author_ids` | string[] | ID архитекторов из `architects.json` |
| `style` | string \| null | Архитектурный стиль |
| `status` | `'exists'` \| `'gone'` \| `'restored'` \| `'reconstructed'` | Состояние |
| `model_url` | string \| null | Путь к `.glb` (только для type `'3d'`) |
| `poster_url` | string | Главное фото |
| `wiki_slug` | string | Имя файла статьи без `.md` |
| `gallery` | string[] | Массив путей к фотографиям |

### Нейрохроники (`neurochronicles.json`)

| Поле | Описание |
|---|---|
| `photo_original` | ЧБ оригинал (путь) |
| `photo_restored` | AI-реставрация (путь) |
| `source_url` / `source_label` | Источник фотографии |
| `wiki_slug` | Статья в вики |

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
- **Нет service worker** — PWA-манифест есть, офлайн-режим не реализован.
- Экраны `3d-viewer` и `neuro` скрывают top bar и tab bar (полноэкранный режим).
- `STATE.mapItems = [...objects, ...neurochronicles]` — единый список всего, что есть на карте.
