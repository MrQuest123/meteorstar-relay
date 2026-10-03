# Сервер онлайн-игры Meteor Star (бесплатно, Render, Франкфурт)

Сервер сводит двух игроков по 6-значному коду лобби и пересылает сообщения матча.
Пинг из России до Франкфурта — примерно 40–60 мс.

## 1. Загрузить сервер на GitHub
1. Зайди на https://github.com → войди или зарегистрируйся.
2. Справа вверху **+** → **New repository** → имя `meteorstar-relay` → **Create repository**.
3. На странице репозитория: **uploading an existing file** → перетащи 3 файла из этой папки:
   `relay.js`, `package.json`, `render.yaml` → **Commit changes**.

## 2. Запустить на Render
1. https://render.com → **Get Started** → войди через **GitHub**.
2. **New +** → **Blueprint** → выбери репозиторий `meteorstar-relay` → **Apply**.
   (Файл render.yaml сам выставит: регион Frankfurt, тариф Free, команды запуска.)
3. Подожди 2–3 минуты, пока статус станет **Live**.
4. Скопируй адрес сервиса, например `https://meteorstar-relay.onrender.com`.
5. Проверь: открой в браузере `https://meteorstar-relay.onrender.com/health` →
   должно быть написано `Meteor Star relay: ok`.

## 3. Вписать адрес в игру
В `GameView.java` найди (Ctrl+F) `RELAY_HOST` и впиши адрес **без https:// и без слэша**:
```java
static final String RELAY_HOST = "meteorstar-relay.onrender.com";
```
Пересобери APK.

## 4. Чтобы сервер не засыпал (бесплатно)
Бесплатный сервер Render засыпает после 15 минут без игроков и потом просыпается ~30 секунд.
Игра сама будит его, когда открываешь «Сетевую игру», но лучше держать его бодрым:
1. https://uptimerobot.com → регистрация → **Add New Monitor**.
2. Тип **HTTP(s)**, URL: `https://meteorstar-relay.onrender.com/health`, интервал **5 минут** → **Create**.
Бесплатных 750 часов в месяц у Render хватает, чтобы сервер работал круглосуточно.

## Как играть
Сетевая игра → **ПО ИНТЕРНЕТУ** → один нажимает **СОЗДАТЬ ЛОББИ** и отправляет код другу,
второй — **ВОЙТИ ПО КОДУ**. В лобби и в матче виден пинг: зелёный — до 80 мс, жёлтый — до 150.
