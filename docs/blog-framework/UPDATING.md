# Обновление framework

Обновление — отдельный проверяемый diff. Ни один `blog*` skill не запускает sync автоматически.

1. Прочитать текущий `vendor/claude-blog/manifest.json`, получить upstream в отдельный checkout. Не запускать installer, hooks, scripts, CI, tests или package setup upstream. Не копировать пользовательские настройки или credentials.
2. Зафиксировать полный commit SHA, сравнить `git diff <old-sha> <new-sha>`. Проверить LICENSE/NOTICE и вложенные лицензии **до копирования**. `brain/` исключён безотносительно похожих функций; возвращать его можно только после отдельного разрешения правообладателя и нового решения о scope. У изменения тега и main могут быть разные commit.
3. Инвентаризировать все новые/удалённые skills, agents, references, templates, scripts, зависимости и побочные эффекты. Повторить статический аудит опасных runtime-путей и актуальности API. Не считать прошедший upstream тест гарантией безопасности или совместимости RU.
4. В отдельной ветке сохранить старый manifest для сравнения, затем удалить **только** `vendor/claude-blog/upstream/` и выполнить наш импортёр:

   ```sh
   node scripts/blog-framework-vendor.mjs /path/to/reviewed/claude-blog FULL_40_CHARACTER_SHA
   ```

   Импортёр читает объекты Git по точному SHA, отклоняет symlink/submodule, сохраняет обычные файлы как `*.upstream` без executable-бита, исключает Brain и вычисляет SHA-256. Он не выполняет скачанный код. Это контролируемая developer-команда, не часть article workflow. Перепроверить `releaseTag` в manifest по фактическому тегу — `declaredVersion` сам по себе не доказывает релиз.
5. Пересмотреть `docs/blog-framework/capabilities.json`, конкретные шаги в `.agents/skills/blog*/SKILL.md`, пять Claude-ролей и CONTRACT. Не «обновлять» адаптеры механическим копированием upstream инструкций. Сохранить MIT, NOTICE и inline FLOW CC BY 4.0 attribution. Копии исходников должны оставаться byte-for-byte; локальные изменения — только в адаптерах.
6. Проверить `pnpm blog:framework` (полнота каталога, hashes, ссылки, регистрации), behavioral tests и негативные случаи: изменение RU/EN после ревью, отсутствующая визуальная проверка, неверная схема и перевод. Затем `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm translate:check`, `pnpm verify:seo-build`, `pnpm test:built`. Провести [dry run](DRY-RUN.md) без production article и API.
7. Обновить датированный аудит, карту статусов и ограничения; открыть draft PR. Проверить CI на его точном head. Не merge/deploy автоматически. Провайдерная интеграция, новая зависимость и лицензия — самостоятельные решения, а не скрытая часть обновления.

Rollback: вернуть предыдущий integration commit обычным проверяемым PR. Framework не пишет глобальные настройки и БД, поэтому отдельный upstream uninstaller не нужен. Не удалять локальные материалы пользователя в `work/`.
