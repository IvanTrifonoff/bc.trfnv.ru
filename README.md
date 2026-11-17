# Баллистический калькулятор (PWA)

Офлайн PWA-калькулятор траектории на Vanilla JS. Модель точечной массы с кривой
сопротивления G1, метрические единицы, справочник патронов и оружия, работа без
интернета после первой загрузки.

## Запуск

### Вариант A: Caddy сам получает сертификат

Порты 80/443 свободны, A-запись домена указывает на VPS:

```bash
echo 'SITE_ADDR=bc.trfnv.ru' > .env
docker compose up -d --build
```

### Вариант B: за уже существующим nginx (как на нашем VPS)

Caddy работает в HTTP-режиме и слушает только localhost:

```bash
cp .env.example .env          # SITE_ADDR=:80, HTTP_BIND=127.0.0.1, HTTP_PORT=6031
docker compose up -d --build
sudo cp deploy/nginx-bc.trfnv.ru.conf /etc/nginx/sites-available/bc.trfnv.ru
sudo ln -sf /etc/nginx/sites-available/bc.trfnv.ru /etc/nginx/sites-enabled/bc.trfnv.ru
sudo certbot certonly --webroot -w /var/www/html -d bc.trfnv.ru --agree-tos -n
sudo nginx -t && sudo systemctl reload nginx
```

## Структура

- `public/` — статический фронтенд (PWA)
- `public/js/ballistics.js` — движок расчёта (G1, RK4, ветер, угол, среда)
- `public/js/chart.js` — график на canvas
- `public/sw.js` — service worker, кэширует всё необходимое для офлайна
- `public/data/catalog.json` — справочник патронов и винтовок
- `Caddyfile`, `Dockerfile`, `docker-compose.yml` — контейнер с HTTPS

## Офлайн-режим

При первой загрузке онлайн service worker кэширует оболочку приложения и
`catalog.json`. Дальше приложение открывается и считает без интернета. Ваши
параметры и добавленные вручную патроны/винтовки хранятся в `localStorage`.

## Проверка на .22LR

Рекомендованный стартовый набор:
- патрон CCI Standard Velocity (2,59 г, BC G1 0,112, 326 м/с)
- винтовка с высотой прицела 25 мм, пристрелка 50 м
- дистанции 10, 25, 50, 75, 100 м

Высота прицела и BC стоит откалибровать по вашему хронографу и реальным
попаданиям — это приближённая модель, а не баллистический радар.

## Разработка

```bash
npm install                         # dev-зависимости для тестов (jsdom)
npm test                            # тесты движка, DOM и SW
npm run icons                       # пересоздать иконки
docker compose up -d --build        # локальный запуск
```
