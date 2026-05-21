---
name: skd-decompile
description: Декомпиляция схемы компоновки данных 1С (СКД) в JSON-черновик в формате skd-compile. Используй когда нужно создать новый отчёт по образцу существующего или провести структурный рефакторинг. Для точечных правок используй skd-edit
argument-hint: <TemplatePath> [-OutputPath <out.json>]
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# /skd-decompile — JSON-черновик из Template.xml СКД

Читает Template.xml и эмитит JSON в формате `skd-compile`. **Результат — черновик**, а не обратимое представление: см. раздел «Что получаешь».

## Когда использовать

- **Scaffold нового отчёта по образцу** — взять существующий СКД, получить JSON, поправить и скомпилировать в новый.
- **Структурный рефакторинг** — переписать вариант, перерисовать шаблон, перебрать набор полей.

## Когда **не** использовать

- **Точечные правки готового отчёта** (добавить поле, фильтр, итог, переименовать) → `/skd-edit`. Точечно, без потерь, без полной реконструкции.

## Параметры

| Параметр | Описание |
|----------|----------|
| `TemplatePath` | Путь к Template.xml (обязательный) |
| `OutputPath` | Путь к выходному JSON. Если не задан — JSON в stdout |

```powershell
powershell.exe -NoProfile -File "${CLAUDE_SKILL_DIR}/scripts/skd-decompile.ps1" -TemplatePath "<Template.xml>" -OutputPath "<out.json>"
```

При наличии `-OutputPath` рядом пишется `<basename>.warnings.md`, если есть непокрытые конструкции.

## Что получаешь

JSON — это **черновик, не полное обратимое представление СКД**. Декомпилятор знает только то, что умеет `skd-compile`, поэтому:

- **Покрытые конструкции** эмитятся в JSON напрямую (поля, параметры с `@autoDates`, шаблоны с rows-стилями, варианты с structure/selection/filter/order/conditionalAppearance и т.п.).
- **Непокрытые, но не критичные** (например, `orderExpression` на полях, `ChoiceParameterLinks` на параметрах, custom per-cell appearance, scope в conditionalAppearance) — заменяются на sentinel `{"__unsupported__": {"id": "W###", "kind": "...", "loc": "..."}}`. JSON остаётся валидным, но **`skd-compile` отказывается компилировать его до тех пор, пока sentinel не убраны** — это намеренно, чтобы непокрытое не уехало в финальный отчёт незамеченным.
- **Критичные конструкции** (Picture cells, ХранилищеЗначения, вариативные шаблоны, не-СКД root) — fail-fast: скрипт завершается с ненулевым кодом и пишет в stderr какой именно элемент не поддержан.

Все непокрытые места — с координатами в `.warnings.md`.

## Workflow

1. `/skd-decompile <Template.xml> -OutputPath draft.json` — получить черновик.
2. Открыть `draft.warnings.md`, посмотреть, что не покрылось.
3. Поправить JSON под задачу. Sentinel-объекты — заменить на ручную реализацию (через явный raw `template`, через ручное описание appearance и т.п.) либо удалить, если конструкция в новом отчёте не нужна.
4. `/skd-compile -DefinitionFile draft.json -OutputPath new-Template.xml` — собрать обратно.
5. `/skd-validate` + `/skd-info` — проверить.
