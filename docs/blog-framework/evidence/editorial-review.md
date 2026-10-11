# Независимое редакционное ревью fixture

Дата: 2026-10-11. Reviewer: отдельный reasoning agent `upstream_runtime_review`, без редактирования статьи.

Article digest: `499af6809575db76979111acabc24e86f559dde7dcb861ba511d37aaf6e7296b`.

Прочитаны полные RU/EN, research, outline, revisions и evidence, русские и английские маршруты, `loader.ts`, `sync-check.ts`, `hash.ts`, `fields.ts`, profile и editorial rules. Утверждения подтверждаются локальным кодом: draft исключается из маршрутов; скрытие в списке и e2e-префикс не защищают прямой маршрут; sourceHash использует нормализованные переводимые поля и тело; review digest учитывает точные байты обоих языков.

Отдельный read-only эксперимент подтвердил: смена tags/date не меняет native sourceHash, смена title/body меняет его, изменение байтов любой статьи меняет review digest. EN sourceHash `ffe7b307e27fff2df722d9bdf5b3cfafb4c14430b1bf86ddd74ba59d5efd3ff8` соответствует RU. Смысл, ограничения, ссылки и код сохранены в переводе. Код помечен фрагментом; выдуманного авторского опыта и измерений нет.

Результат: sources, technical-review, voice-review, translation-review — **pass**. Блокирующих замечаний нет. Этот reviewer не проверял внешнюю доступность URL и изображения; результаты native/browser/HEAD принадлежат основному агенту и записаны отдельно.
