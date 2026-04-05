# web-test runner: спецификация

Версия: 0.1 (черновик)
Дата: 2026-04-05

## Обзор

Единый механизм регрессионного тестирования веб-клиента 1С.
Два сценария использования, один инструмент:

1. **Внутренний регресс** -- тестирование API browser.mjs для безопасного рефакторинга
2. **Пользовательский регресс** -- тестирование 1С-приложений (доработанных типовых или разработанных с нуля)

Принцип: если удобно для пользовательского регресса, подходит и для внутреннего.

Паттерны следуют конвенциям Playwright Test (обёртки шагов, хуки, утверждения).

---

## 1. Командная строка

```
node run.mjs test [url] <dir|file> [флаги]
```

| Флаг | По умолчанию | Описание |
|------|-------------|----------|
| `--tags=smoke,crud` | (все) | Фильтр тестов по тегам (пересечение) |
| `--grep=pattern` | (все) | Фильтр тестов по имени (регулярное выражение) |
| `--bail` | false | Остановиться при первом падении |
| `--retry=N` | 0 | Повторить упавшие тесты N раз |
| `--timeout=ms` | 30000 | Таймаут на тест (мс) |
| `--report=path` | (нет) | Записать JSON-отчёт в файл |
| `--format=fmt` | json | Формат отчёта: `json`, `allure`, `junit` |
| `--report-dir=path` | (нет) | Каталог для результатов Allure |
| `--screenshot=strategy` | on-failure | `on-failure` / `every-step` / `off` |
| `--record` | false | Записывать видео для каждого теста |

URL необязателен, если в каталоге тестов есть `webtest.config.mjs`.

### Режим выполнения

In-process (не через HTTP). Раннер:
1. Загружает конфиг (если есть)
2. Обнаруживает файлы `*.test.mjs`
3. Импортирует каждый модуль, извлекает метаданные
4. Фильтрует по тегам/grep/only
5. Группирует по контексту, сортирует по алфавиту внутри группы
6. Подключается к 1С (`browser.connect(url)`)
7. Выполняет тесты последовательно
8. Отключается, выводит результаты

---

## 2. Формат тест-модуля

Каждый файл `*.test.mjs` -- ES-модуль.

### Экспорты

| Экспорт | Тип | Обязателен | По умолчанию | Описание |
|---------|-----|-----------|-------------|----------|
| `name` | `string` | да | -- | Читаемое имя теста |
| `default` | `async function(ctx)` | да | -- | Тело теста |
| `tags` | `string[]` | нет | `[]` | Теги для фильтрации |
| `timeout` | `number` | нет | 30000 | Таймаут теста (мс) |
| `skip` | `boolean \| string` | нет | false | Пропустить тест (строка = причина) |
| `only` | `boolean` | нет | false | Запустить только этот тест (отладка) |
| `context` | `string` | нет | defaultContext | Имя контекста из конфига |
| `contexts` | `string[]` | нет | -- | Мульти-пользовательский процессный тест |
| `params` | `object[]` | нет | -- | Параметризация (будущее) |
| `setup` | `async function(ctx)` | нет | -- | Подготовка перед тестом |
| `teardown` | `async function(ctx)` | нет | -- | Очистка после теста (выполняется всегда) |

### Пример: тест с одним контекстом

```js
export const name = 'CRUD справочника Контрагенты';
export const tags = ['smoke', 'crud', 'catalog'];
export const timeout = 45000;

export default async function({ navigateSection, openCommand, clickElement,
  fillFields, readTable, closeForm, getFormState, assert, step, log }) {

  await step('Открыть список', async () => {
    await navigateSection('Склад');
    await openCommand('Контрагенты');
  });

  await step('Создать элемент', async () => {
    await clickElement('Создать');
    await fillFields({ 'Наименование': 'Тест-' + Date.now() });
    await clickElement('Записать и закрыть');
  });

  await step('Проверить в списке', async () => {
    const table = await readTable();
    assert.tableHasRow(table, r => r['Наименование']?.startsWith('Тест-'));
    log('Элемент найден в списке');
  });
}
```

### Пример: мульти-контекстный процессный тест

```js
export const name = 'Согласование приходной накладной';
export const contexts = ['кладовщик', 'менеджер'];
export const tags = ['process'];

export default async function({ кладовщик, менеджер, step }) {

  await step('Кладовщик создаёт накладную', async () => {
    await кладовщик.navigateSection('Склад');
    await кладовщик.openCommand('Приходные накладные');
    await кладовщик.clickElement('Создать');
    await кладовщик.fillFields({ 'Контрагент': 'ООО Поставщик' });
    await кладовщик.clickElement('Записать');
  });

  await step('Менеджер утверждает', async () => {
    await менеджер.navigateSection('Согласование');
    await менеджер.openCommand('На утверждении');
    await менеджер.clickElement('ООО Поставщик', { dblclick: true });
    await менеджер.clickElement('Утвердить');
  });
}
```

---

## 3. Объект контекста

Каждая тестовая функция получает объект контекста `ctx`:

### API браузера (все экспорты browser.mjs)

Все функции обёрнуты авто-обнаружением ошибок (как в `executeScript`):
- При модальной/всплывающей ошибке 1С: скриншот + `fetchErrorStack` + throw
- Обёрнутые ACTION_FNS: `clickElement`, `fillFields`, `fillField`, `selectValue`,
  `fillTableRow`, `deleteTableRow`, `openCommand`, `navigateSection`,
  `navigateLink`, `openFile`, `closeForm`, `filterList`, `unfilterList`

Полный список доступных функций:

**Навигация:** `navigateSection`, `openCommand`, `switchTab`, `navigateLink`, `openFile`
**Состояние:** `getFormState`, `getPageState`, `getSections`, `getCommands`
**Таблицы:** `readTable`, `readSpreadsheet`, `fillTableRow`, `deleteTableRow`
**Поля:** `fillFields`, `fillField`, `selectValue`
**Действия:** `clickElement`, `closeForm`, `filterList`, `unfilterList`
**Запись:** `startRecording`, `stopRecording`, `isRecording`, `addNarration`, `getCaptions`
**Презентация:** `showCaption`, `hideCaption`, `highlight`, `unhighlight`, `showTitleSlide`, `showImage`
**Утилиты:** `screenshot`, `wait`, `getPage`, `getSession`

### Тестовые утилиты

- `step(name, fn)` -- обёртка шага (см. раздел 4)
- `assert.*` -- хелперы утверждений (см. раздел 5)
- `log(...args)` -- добавить в вывод теста

### Мульти-контекст

При `export const contexts = ['a', 'b']`:
- `ctx.a` и `ctx.b` -- отдельные объекты контекста, каждый с полным API браузера
- `ctx.step` и `ctx.assert` остаются на верхнем уровне

---

## 4. step(name, fn) -- обёртка шага

```js
await step('Имя шага', async () => {
  // тело шага
});
```

Поведение:
- Записывает метку `start` перед `fn()`
- Записывает метку `stop` после `fn()` (успех или ошибка)
- При ошибке: устанавливает `status: 'failed'`, прикрепляет сообщение, пробрасывает исключение
- При успехе: устанавливает `status: 'passed'`
- Если стратегия скриншотов `every-step`: делает скриншот после `fn()`
- Вложенные шаги поддерживаются (шаг внутри шага)
- Напрямую маппится на шаги Allure

Структура данных шага (для отчётов):

```js
{
  name: 'Имя шага',
  start: 1712345678000,  // мс от эпохи
  stop:  1712345679200,
  status: 'passed' | 'failed',
  error: 'сообщение' | undefined,
  screenshot: 'путь' | undefined,
  steps: []  // вложенные шаги
}
```

Реализация (~15 строк):

```js
async function step(name, fn) {
  const s = { name, start: Date.now(), status: 'passed', steps: [] };
  const parent = currentSteps;
  parent.push(s);
  const prev = currentSteps;
  currentSteps = s.steps;
  try {
    await fn();
  } catch (e) {
    s.status = 'failed';
    s.error = e.message;
    throw e;
  } finally {
    s.stop = Date.now();
    currentSteps = prev;
  }
}
```

---

## 5. Утверждения (assertions)

Простые хелперы утверждений. Без зависимостей. Бросают `AssertionError` со
свойствами `.actual`, `.expected`, `.message`.

### Общие

```js
assert.ok(value, msg)                    // истинность
assert.equal(actual, expected, msg)      // ===
assert.notEqual(actual, expected, msg)   // !==
assert.deepEqual(actual, expected, msg)  // сравнение через JSON
assert.includes(haystack, needle, msg)   // string/array .includes()
assert.match(string, regex, msg)         // проверка регулярным выражением
assert.throws(asyncFn, msg)             // ожидает исключение
```

### Специфичные для 1С

```js
assert.formHasField(state, fieldName, msg)
// проверяет наличие state.fields[fieldName]

assert.formTitle(state, expected, msg)
// проверяет state.title === expected (или includes)

assert.tableHasRow(table, predicate, msg)
// predicate: объект (частичное совпадение) или функция
// объект: assert.tableHasRow(table, { 'Наименование': 'Тест' })
// функция: assert.tableHasRow(table, r => r['Сумма'] > 100)

assert.tableRowCount(table, expected, msg)
// проверяет table.rows.length === expected

assert.noErrors(state, msg)
// проверяет !state.errors
```

---

## 6. Хуки

Все хуки определяются в `_hooks.mjs` в корне каталога тестов.

### Два уровня

**Инфраструктурный уровень** (без браузера):
- `prepare()` -- до подключения (восстановление БД, публикация, загрузка данных)
- `cleanup()` -- после отключения (удаление публикации, очистка)

**Тестовый уровень** (с контекстом браузера):
- `beforeAll(ctx)` -- после подключения, перед первым тестом
- `afterAll(ctx)` -- после последнего теста, до отключения
- `beforeEach(ctx)` -- перед каждым тестом
- `afterEach(ctx)` -- после каждого теста

### Порядок выполнения

```
prepare()                    // без браузера
  browser.connect(url)
    beforeAll(ctx)           // браузер готов
      beforeEach(ctx)
        test.setup(ctx)      // подготовка теста
          test.default(ctx)  // тело теста
        test.teardown(ctx)   // очистка теста (всегда)
      afterEach(ctx)         // всегда
      [встроенный сброс]     // всегда
      ...следующий тест...
    afterAll(ctx)
  browser.disconnect()
cleanup()                    // без браузера
```

### Встроенный сброс состояния

После каждого теста (после `afterEach`) раннер гарантирует чистое состояние:

```js
await dismissPendingErrors();
while (есть открытые формы) {
  await closeForm({ save: false });
}
```

Это гарантирует, что каждый тест стартует с чистого рабочего стола,
независимо от того, как завершился предыдущий (падение, таймаут, ошибка утверждения).

### Пример _hooks.mjs

```js
import { execSync } from 'child_process';

export async function prepare() {
  execSync('powershell.exe -File scripts/restore-db.ps1');
  execSync('powershell.exe -File scripts/publish.ps1');
}

export async function cleanup() {
  execSync('powershell.exe -File scripts/unpublish.ps1');
}

export async function beforeAll({ navigateSection }) {
  await navigateSection('Склад');
}

export async function afterEach({ closeForm }) {
  // пользовательская очистка после теста (необязательно, встроенный сброс тоже сработает)
}
```

---

## 7. Файл конфигурации

`webtest.config.mjs` в корне каталога тестов. Необязателен -- если отсутствует,
URL должен быть передан через CLI.

```js
export default {
  // Контексты: именованные URL для разных пользователей/ролей
  contexts: {
    кладовщик: { url: 'http://localhost/app-clerk/ru_RU' },
    менеджер:  { url: 'http://localhost/app-manager/ru_RU' },
    админ:     { url: 'http://localhost/app-admin/ru_RU' },
  },
  defaultContext: 'кладовщик',

  // Значения по умолчанию (переопределяются флагами CLI)
  timeout: 30000,
  retries: 0,
  screenshot: 'on-failure',  // 'every-step' | 'off'
  record: false,
};
```

**Упрощённая форма** (один контекст, без именованных):

```js
export default {
  url: 'http://localhost/app/ru_RU',
  timeout: 30000,
};
```

Флаги CLI всегда переопределяют значения конфига.

---

## 8. Контексты

### Одиночный контекст (по умолчанию)

Большинство тестов. Один браузер, один пользователь. Тест получает плоский контекст со всем API.

```js
export const context = 'кладовщик';  // необязательно, используется defaultContext
export default async function({ clickElement, fillFields, ... }) { }
```

### Группировка по контексту

Раннер группирует тесты по значению `context`, минимизирует переподключения:
1. Собрать все тесты, сгруппировать по имени контекста
2. Для каждой группы: подключиться -> выполнить тесты -> отключиться
3. Внутри группы тесты выполняются по алфавиту

### Мульти-контекст (процессные тесты)

```js
export const contexts = ['кладовщик', 'менеджер'];
export default async function({ кладовщик, менеджер, step, assert }) { }
```

Каждый именованный контекст -- полноценный объект API. Тест оркестрирует переключение.

**Этапы реализации:**
- Этап 1: последовательное переподключение (отключиться от одного URL, подключиться к другому)
- Этап 2: параллельные браузеры (после рефакторинга browser.mjs в `createContext()`)

---

## 9. Отчёты

### JSON (нативный, по умолчанию)

```json
{
  "runner": "web-test",
  "url": "http://localhost/app/ru_RU",
  "startedAt": "2026-04-05T10:00:00.000Z",
  "finishedAt": "2026-04-05T10:05:30.000Z",
  "duration": 330.0,
  "summary": {
    "total": 25,
    "passed": 23,
    "failed": 1,
    "skipped": 1
  },
  "tests": [
    {
      "name": "CRUD справочника Контрагенты",
      "file": "02-catalog-crud.test.mjs",
      "tags": ["smoke", "crud"],
      "context": "кладовщик",
      "status": "passed",
      "duration": 12.3,
      "attempts": 1,
      "steps": [
        {
          "name": "Открыть список",
          "start": 1712345678000,
          "stop": 1712345679200,
          "status": "passed",
          "steps": []
        }
      ],
      "output": "Элемент найден в списке",
      "error": null,
      "screenshot": null
    },
    {
      "name": "Обязательное поле",
      "file": "10-validation.test.mjs",
      "tags": ["validation"],
      "context": "кладовщик",
      "status": "failed",
      "duration": 8.1,
      "attempts": 2,
      "steps": [
        {
          "name": "Сохранить пустую форму",
          "start": 1712345700000,
          "stop": 1712345708100,
          "status": "failed",
          "error": "Ожидалось модальное окно ошибки, но форма сохранилась"
        }
      ],
      "output": "",
      "error": {
        "message": "Ожидалось модальное окно ошибки, но форма сохранилась",
        "step": "Сохранить пустую форму",
        "screenshot": "error-shot-10.png"
      },
      "screenshot": "error-shot-10.png"
    }
  ]
}
```

### Allure (`--format=allure --report-dir=allure-results/`)

Отдельные JSON-файлы для каждого теста в каталоге `allure-results/`:

```json
{
  "uuid": "сгенерированный-uuid",
  "name": "CRUD справочника",
  "fullName": "02-catalog-crud.test.mjs",
  "status": "passed",
  "stage": "finished",
  "start": 1712345678000,
  "stop": 1712345690300,
  "labels": [
    { "name": "tag", "value": "smoke" },
    { "name": "tag", "value": "crud" }
  ],
  "steps": [
    {
      "name": "Открыть список",
      "status": "passed",
      "start": 1712345678000,
      "stop": 1712345679200,
      "steps": []
    }
  ],
  "attachments": [
    {
      "name": "Скриншот при падении",
      "source": "uuid-attachment.png",
      "type": "image/png"
    }
  ]
}
```

Скриншоты/видео копируются в `allure-results/` с уникальными именами.

### JUnit XML (`--format=junit`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="web-test" tests="25" failures="1" skipped="1" time="330.0">
  <testsuite name="tests/web-test" tests="25" failures="1" skipped="1">
    <testcase name="CRUD справочника" classname="02-catalog-crud.test.mjs" time="12.3"/>
    <testcase name="Обязательное поле" classname="10-validation.test.mjs" time="8.1">
      <failure message="Ожидалось модальное окно ошибки, но форма сохранилась">
        Стек вызовов...
      </failure>
      <system-out>Скриншот: error-shot-10.png</system-out>
    </testcase>
  </testsuite>
</testsuites>
```

---

## 10. Консольный вывод

```
web-test -- http://localhost/app/ru_RU
Запуск 25 тестов из tests/web-test/

  ✓ Навигация по разделам (2.1s)
  ✓ CRUD справочника Контрагенты (12.3s)
    ├ Открыть список (1.2s)
    ├ Создать элемент (8.0s)
    └ Проверить в списке (3.1s)
  ✗ Обязательное поле (8.1s)
    ├ Открыть форму (2.0s)
    └ ✗ Сохранить пустую форму (6.1s)
      Ожидалось модальное окно ошибки, но форма сохранилась
      скриншот: error-shot-10.png
  ○ Составной тип (skip: не реализовано)

23 passed, 1 failed, 1 skipped (2m 0.5s)
```

Шаги показываются для упавших тестов (всегда) и для успешных (в verbose-режиме).

---

## 11. Скриншоты и видео

### Стратегия скриншотов

| Стратегия | Поведение |
|-----------|----------|
| `on-failure` (по умолчанию) | Скриншот при падении теста, прикрепляется к ошибке |
| `every-step` | Скриншот в конце каждого `step()`, плюс при падении |
| `off` | Без автоматических скриншотов |

Скриншоты сохраняются в каталог отчёта по шаблону `{индекс-теста}-{имя-шага}.png`.

### Видеозапись

При включённом `--record`:
- `startRecording()` перед каждым тестом
- `stopRecording()` после каждого теста
- Видео сохраняется как `{индекс-теста}-{имя-теста}.mp4`
- Прикрепляется к отчёту (Allure: вложение видео)

---

## 12. Сброс состояния

Встроенный механизм, выполняется после `afterEach` (и `teardown`) каждого теста:

```js
async function resetState(ctx) {
  // 1. Убрать все ожидающие диалоги ошибок/всплывающие уведомления
  try { await ctx.dismissPendingErrors(); } catch {}

  // 2. Закрыть все открытые формы до рабочего стола
  for (let i = 0; i < 10; i++) {
    const state = await ctx.getFormState();
    if (!state.form) break;
    try { await ctx.closeForm({ save: false }); } catch { break; }
  }
}
```

Гарантирует, что каждый тест стартует с чистого рабочего стола,
независимо от того, как завершился предыдущий (падение, таймаут, ошибка утверждения).

---

## 13. Параметризация (будущее)

Формат зарезервирован, реализация отложена.

```js
export const name = 'Заполнение поля {type}';
export const params = [
  { type: 'String', field: 'Наименование', value: 'Тест' },
  { type: 'Number', field: 'Цена', value: '100.50' },
  { type: 'Date', field: 'ДатаПоступления', value: '01.01.2024' },
  { type: 'Boolean', field: 'Активен', value: true },
];

export default async function({ fillFields, getFormState, assert }, { type, field, value }) {
  await fillFields({ [field]: value });
  const state = await getFormState();
  assert.equal(state.fields[field]?.value, String(value));
}
```

В отчётах каждый набор параметров отображается как отдельный тест:
- "Заполнение поля String"
- "Заполнение поля Number"
- "Заполнение поля Date"
- "Заполнение поля Boolean"

---

## 14. buildContext() -- рефакторинг executeScript

Извлечь из `executeScript()` в `run.mjs` (строки 104-214):

**Что извлечь:**
- Сбор всех экспортов `browser.*` в объект
- Обёртка ACTION_FNS авто-обнаружением ошибок (проверка модальных/всплывающих после каждого вызова)
- Захват скриншота до того, как `fetchErrorStack` закроет модальное окно ошибки
- Вызов `fetchErrorStack` для модальных ошибок
- Заглушки `noRecord` для функций записи/озвучки

**Сигнатура новой функции:**
```js
function buildContext({ noRecord = false } = {}) -> object
```

**Использование после рефакторинга:**
- `executeScript()` вызывает `buildContext()` + `new AsyncFunction(...)` (поведение не меняется)
- `cmdTest()` вызывает `buildContext()` + `import()` + `mod.default(ctx)` (новое поведение)

---

## 15. Синтетическая тестовая конфигурация

### Текущие объекты base-config

| Объект | Поля | Форма |
|--------|------|-------|
| Справочник Контрагенты | ИНН (String 12), Телефон (String 20) | ФормаЭлемента: 3 поля ввода |
| Справочник Номенклатура | Артикул (String 25), ЕдиницаИзмерения (String 10) | -- |
| Перечисление ВидыНоменклатуры | Товар, Услуга, Работа | -- |
| Документ ПриходнаяНакладная | Контрагент (String); ТЧ Товары (4 колонки) | ФормаДокумента |
| РН ОстаткиТоваров | Изм: Номенклатура; Рес: Количество, Сумма | -- |
| РС КурсыВалют | Изм: Валюта; Рес: Курс, Кратность | -- |
| Константа ОсновнаяВалюта | String 10 | -- |
| Отчёт ОстаткиТоваров | Схема СКД | -- |
| Подсистема Склад | все объекты | -- |
| Роль Кладовщик | права Read/View | -- |

### Что нужно добавить

| Изменение | Зачем (какой API тестируем) |
|-----------|---------------------------|
| Номенклатура: +Цена (Number 15.2) | fillFields -- число |
| Номенклатура: +Активен (Boolean) | fillFields -- флажок |
| Номенклатура: +ВидНоменклатуры (EnumRef) | fillFields -- ссылка на перечисление |
| Номенклатура: +ДатаПоступления (Date) | fillFields -- дата |
| Номенклатура: +Комментарий (String неограниченная) | fillFields -- многострочный текст |
| Номенклатура: FillChecking на Наименование | Тест ошибки валидации |
| Номенклатура: hierarchical=true | clickElement expand/collapse |
| Номенклатура: Форма с 2 вкладками (Основное / Дополнительно) | switchTab |
| ПриходнаяНакладная.Контрагент -> CatalogRef.Контрагенты | selectValue (ссылочное поле) |
| +Подсистема Администрирование (КурсыВалют, ОсновнаяВалюта) | navigateSection между разделами |
| Роль: полные права (не только Read/View) | CRUD без ограничений |

### Способ сборки

Интеграционный тест `build-webtest-config.test.mjs` собирает конфигурацию через
пайплайн навыков (cf-init -> meta-compile -> form-compile -> ...).
Результат кэшируется в `.cache/webtest-config/`.
Первый запуск требует: загрузку в 1С (`db-load-xml`) + веб-публикацию (`web-publish`).

---

## 16. Каталог тест-кейсов

Расположение: `tests/web-test/`

| # | Файл | Теги | Покрытие API |
|---|------|------|-------------|
| 01 | navigation.test.mjs | nav, smoke | navigateSection, getPageState, getSections, getCommands |
| 02 | catalog-crud.test.mjs | crud, catalog, smoke | openCommand, fillFields, clickElement, closeForm, readTable, getFormState |
| 03 | field-types.test.mjs | fields | fillFields (строка, число, дата, булево, перечисление) на Номенклатуре |
| 04 | reference-field.test.mjs | fields, select | selectValue на ПриходнаяНакладная.Контрагент |
| 05 | table-operations.test.mjs | table, smoke | readTable, fillTableRow, deleteTableRow |
| 06 | document-workflow.test.mjs | doc, smoke | Создание документа, заполнение шапки + ТЧ, проведение, отмена |
| 07 | tabs.test.mjs | tabs | switchTab на форме Номенклатуры |
| 08 | hierarchy.test.mjs | hierarchy | clickElement с expand/collapse на Номенклатуре |
| 09 | filter-list.test.mjs | filter | filterList, unfilterList, расширенный фильтр по полю |
| 10 | validation.test.mjs | validation | Ошибка обязательного поля, подтверждение при закрытии |
| 11 | report.test.mjs | report | Открыть отчёт, задать параметры, сформировать, readSpreadsheet |
| 12 | form-state.test.mjs | state | getFormState: поля, кнопки, таблицы |
| 13 | screenshots.test.mjs | util | screenshot(), wait() |

~30 тест-кейсов, покрывающих все основные области API browser.mjs.

---

## 17. Дорожная карта реализации

| # | Задача | Результат | Зависимости |
|---|--------|-----------|-------------|
| 1 | Архитектурная спецификация | `docs/web-test-runner-spec.md` (этот файл) | -- |
| 2 | Рефакторинг buildContext() | run.mjs: извлечение из executeScript | спека |
| 3 | Ядро cmdTest() | run.mjs: обнаружение, импорт, выполнение, консольный вывод, JSON-отчёт | #2 |
| 4 | Утверждения + обёртка step() | run.mjs: assert.*, step(name, fn) | #3 |
| 5 | Хуки (prepare/cleanup + before/after) | run.mjs: поддержка _hooks.mjs | #3 |
| 6 | Файл конфигурации + контексты | run.mjs: webtest.config.mjs, маршрутизация контекстов | #3 |
| 7 | Форматы отчётов (Allure, JUnit) | run.mjs: --format=allure/junit | #3 |
| 8 | Синтетическая конфигурация | integration/build-webtest-config.test.mjs | спека |
| 9 | Smoke-тесты (01-06) | tests/web-test/01-06*.test.mjs | #3, #8 |
| 10 | Остальные тесты (07-13) | tests/web-test/07-13*.test.mjs | #9 |
