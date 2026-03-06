# Автоматическая очистка зарезервированных устройств

Веб-приложение для автоматического снятия брони с устройств на стенде тестирования. Запускает очистку по расписанию в заданное время (таймзона Asia/Yekaterinburg).

## Стек

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Docker:** docker-compose (два контейнера — backend + nginx)

## Быстрый старт (Docker)

### 1. Клонировать репозиторий

```bash
git clone https://github.com/Arishka-a/cleaner-app.git
cd cleaner-app
```

### 2. Создать файл `.env` в корне проекта

```dotenv
PORT=3001
STAND_BASE_URL=https://your-stand-url.com/api
STAND_USERNAME=your_username
STAND_PASSWORD=your_password
TIME_API_URL=https://timeapi.io/api/Time/current/zone?timeZone=Asia/Yekaterinburg
```

### 3. Запустить

```bash
docker-compose up --build
```

### 4. Открыть

Приложение: http://localhost:3000

### 5. Логи

```bash
docker logs cleaner-app
```

### 6. Остановить

```bash
docker-compose down
```

## Локальная разработка (без Docker)

```bash
# бэкенд
cd backend
npm install
node server.js

# фронтенд
cd frontend
npm install
npm run dev
```

Фронтенд: http://localhost:5173, бэкенд: http://localhost:3001

## Функциональность

- Установка времени автоматической очистки через веб-интерфейс
- Ручной запуск очистки по кнопке
- Автоматический запуск по расписанию (проверка каждые 60 секунд)
- Получение точного времени через внешний API (системное время не используется)
- Подробные JSON-логи каждого запуска (доступны через `docker logs`)
- Обработка всех ошибок без остановки приложения

## Структура проекта

```
cleaner-app/
├── backend/
│   ├── server.js          
│   ├── package.json
│   ├── Dockerfile
│   └── schedule.json      
├── frontend/
│   ├── src/
│   │   ├── App.jsx        
│   │   ├── App.css        
│   │   └── main.jsx       
│   ├── package.json
│   ├── Dockerfile
│   ├── nginx.conf         
│   └── .env.development   
├── docker-compose.yml
├── .env.example           
├── .gitignore
└── README.md
```

## Формат логов

Каждый запуск очистки выводит JSON-объект в stdout:

```json
{
  "timestamp_start": "2026-03-04 03:00:01",
  "timestamp_end": "2026-03-04 03:00:20",
  "duration_seconds": 19.23,
  "timezone": "Asia/Yekaterinburg",
  "auth": {
    "success": true,
    "error_message": null
  },
  "devices": {
    "total_found": 12,
    "hostnames_processed": ["pc-01", "pc-02"]
  },
  "deletion": {
    "successful": 10,
    "failed": 2,
    "deleted_hostnames": ["pc-01", "pc-02"],
    "failed_hostnames": ["pc-07"]
  },
  "errors": []
}
```