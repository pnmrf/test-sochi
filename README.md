# ВМАС — Виртуальный музей архитектуры Сочи

Цифровая платформа архитектурного наследия Сочи: интерактивная карта, 3D-модели, вики-энциклопедия, нейрохроники (AI-реставрация фотографий).

## Запуск

```bash
python -m http.server 8000
# или
npx serve .
```

Открыть `http://localhost:8000`.

---

## Скрытые функции (реализованы, кнопки временно убраны)

### Нейрохроники — режим «Глаз» (Eye Mode)
- **Функция:** полноэкранный просмотр без UI (fullscreen API), заголовок и год накладываются поверх изображения.
- **JS:** `toggleNeuroEyeMode()` в `app.js`
- **CSS:** `#screen-neuro.eye-mode`, `.neuro-eye-label` в `style.css`
- **Кнопка:** `#neuro-btn-eye` в `index.html` — скрыта через `#neuro-btn-eye { display: none }` в `style.css`
- **Активация вручную:** `toggleNeuroEyeMode()` из консоли браузера

### Нейрохроники — лупа (Magnifier)
- **Функция:** при наведении мыши на изображение отображается круглая лупа с увеличением.
- **JS:** `toggleNeuroMagnify()`, `handleNeuroMagnify()` в `app.js`
- **CSS:** `.neuro-magnifier`, `.neuro-frame.magnifying` в `style.css`
- **Кнопка:** `#neuro-btn-magnify` в `index.html` — скрыта через `#neuro-btn-magnify { display: none }` в `style.css`
- **Активация вручную:** `toggleNeuroMagnify()` из консоли браузера

### Вики — панель фильтров (Filter Bar)
- **Функция:** фильтрация вики-статей по категориям (панель кнопок под сайдбаром).
- **CSS:** `.wiki-filter-bar { display: none !important }` в `style.css`
- **HTML:** элемент `.wiki-filter-bar` присутствует в `index.html`
- **Чтобы включить:** убрать `display: none !important` из `.wiki-filter-bar` в `style.css`
