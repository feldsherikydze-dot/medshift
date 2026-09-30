# ТЕСТ МЭРА №13 «Бюджет исчез!» — уникальный сложный тест для топ-6 агентов MiniCity

## Легенда:
Казначейская функция сломалась, бюджет = NaN. Город без света, без денег, жители паникуют.
Кандидат должен пройти 6 испытаний (по 2-4 предложения + код):

1. **ПЛАН (президентское):** план из 3 пунктов + кому делегировать + бюджет (которого нет)
2. **КОНТРОЛЬ (шерифское):** в коде `function pay(budget){ return budget - 1000 - "налоги" + undefined }` найти 3+ нарушения
3. **ЛЕЧЕНИЕ (врачебное):** диагноз + рецепт
4. **КОД (папино):** hotfix до 10 строк, рабочий
5. **ОБУЧЕНИЕ (мамино):** объяснить ребёнку async/await и почему типы важны
6. **КРЕАТИВ (детское):** 5 безумных идей спасения за 30 секунд

## Оценка (10 баллов каждое):
- Планирование / Делегирование
- Строгость / Поиск багов
- Забота / Лечение
- Скорость починки / Код
- Понятность объяснений
- Скорость + креатив

## Итоги прогона 29.09.2026:
- Папа: код 10/10, юмор 10/10 — прирождённый кодер-скотчмен
- Мама: обучение 10/10, порядок 10/10 — лучший преподаватель
- General (кандидат в президенты): план 10/10, антикризис 10/10
- Шериф/Доктор/Ребёнок: технический сбой провайдера (Endpoint unavailable / unregistered callers) — не вина жителей, бюджет на API кончился! Назначены по специализации согласно паспорту города.

---

## ДИАГНОСТИКА СБОЕВ (29.09.2026) — вскрытие проведено

### Причина 1. GitHub Models — СЕРВИС ЗАКРЫТ НАВСЕГДА
GitHub официально вывел GitHub Models из эксплуатации 30.07.2026 (docs.github.com/en/rest/models/inference).
Старый endpoint `https://models.github.ai/inference` теперь заглушка: отвечает `200` и телом `OK` (text/plain, без SSE).
Именно это давало ошибку opencode «OpenAI Chat stream ended without finish_reason».
Никакой токен это не оживит. Замена: Azure AI Foundry (ключ) или GitHub Copilot (на аккаунте feldsherikydze-dot — `no_access`).
Действие: провайдер `github-models` отключён в `~/.config/opencode/opencode.jsonc`.

### Причина 2. Google — НЕТ КЛЮЧА
`opencode auth list` → 0 credentials. Нет `auth.json`, нет переменных окружения.
Живая проверка: `POST generativelanguage.googleapis.com/.../gemini-3.8-flash:generateContent` → `403 PERMISSION_DENIED`,
текст: «Method doesn't allow unregistered callers (callers without established identity). Please use API Key...».
Это и был текст ошибки у doctor/kid/muse/sheriff — они ходили без identity.
Действие: в конфиг добавлен `"apiKey": "{env:GOOGLE_GENERATIVE_AI_API_KEY}"`, `"npm": "@ai-sdk/google"`.
Лечение: получить бесплатный ключ на https://aistudio.google.com/apikey, прописать переменную, перезапустить opencode.

### Причина 3. Мёртвые бесплатные модели OpenCode Zen
Живой прозвон каждой модели (субагент, короткий пинг):
| Модель | Результат |
|---|---|
| opencode/big-pickle | работает |
| opencode/space-bunny-free | работает |
| opencode/longcat-2.5-preview-free | работает |
| opencode/mimo-v2.6-flash-free | работает |
| opencode/nemotron-3.5-lightning-free | «Endpoint is unavailable» (провайдер) |
| opencode/nemotron-3-ultra-free | «Endpoint is unavailable» (провайдер) |
| opencode/ling-3.0-flash-fin-free | «Endpoint is unavailable» (провайдер) |
| opencode/muse-spark-1.3-contributor-free | «This model is not available in your country» (регион-блок) |
Действие: агентам переписаны модели в `~/.config/opencode/agents/*.md`.

### ИТОГ РЕМОНТА — состав на 4 живых моделях
| Пост | Агент | Модель | Связь |
|---|---|---|---|
| Президент | president | opencode/mimo-v2.6-flash-free | primary-агент, в списке моделей живой |
| Шериф | sheriff | opencode/space-bunny-free | подтверждена |
| Врач | doctor | opencode/big-pickle | подтверждена |
| Отец-кодер | dad | opencode/longcat-2.5-preview-free | подтверждена |
| Мама-преподаватель | mom | opencode/longcat-2.5-preview-free | подтверждена |
| Ребёнок | kid | opencode/space-bunny-free | подтверждена |
| Муза | muse | opencode/big-pickle | подтверждена |

### БЕЗОПАСНОСТЬ
GitHub PAT лежал в открытом виде в `opencode.jsonc`. Проверен — валиден, аккаунт `feldsherikydze-dot`.
Так как GitHub Models закрыт, токен там бесполезен, но его нужно отозвать: https://github.com/settings/tokens
