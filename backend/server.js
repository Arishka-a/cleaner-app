require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const STAND_BASE_URL = process.env.STAND_BASE_URL;
const STAND_USERNAME = process.env.STAND_USERNAME;
const STAND_PASSWORD = process.env.STAND_PASSWORD;
const TIME_API_URL = process.env.TIME_API_URL || 'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Yekaterinburg';

app.use(cors());
app.use(express.json());

const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

let alreadyRanToday = false;
let lastMatchedTime = null;

async function ensureScheduleFile() {
    try {
        await fs.access(SCHEDULE_FILE);
    } catch (err) {
        const defaultSchedule = { time: "03:00" };
        await fs.writeFile(SCHEDULE_FILE, JSON.stringify(defaultSchedule, null, 2));
        console.log('Создан файл schedule.json с временем по умолчанию 03:00');
    }
}

async function getSavedTime() {
    try {
        const content = await fs.readFile(SCHEDULE_FILE, 'utf-8');
        const data = JSON.parse(content);
        return data.time || null;
    } catch (err) {
        console.error('[SCHEDULER] Ошибка чтения schedule.json:', err.message);
        return null;
    }
}

async function getTimeFromAPI() {
    const response = await fetch(TIME_API_URL);

    if (!response.ok) {
        throw new Error(`Time API вернул статус ${response.status}`);
    }

    const data = await response.json();
    return data.time;
}

async function authenticate() {
    const response = await axios.post(
        `${STAND_BASE_URL}/auth/token`,
        new URLSearchParams({
            grant_type: 'password',
            username: STAND_USERNAME,
            password: STAND_PASSWORD
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    return response.data.access_token;
}

async function getReservedDevices(token) {
    const response = await axios.get(
        `${STAND_BASE_URL}/device_data`,
        {
            params: {
                deactivated: false,
                reservation_status: 'reserved'
            },
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    return response.data;
}

async function deleteReservation(hostname, token) {
    await axios.delete(
        `${STAND_BASE_URL}/device_reserve/by_hostname`,
        {
            params: { hostname },
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
}

async function runCleanup() {
    const startTime = new Date();

    const result = {
        timestamp_start: formatDate(startTime),
        timestamp_end: null,
        duration_seconds: null,
        timezone: 'Asia/Yekaterinburg',
        auth: {
            success: false,
            error_message: null
        },
        devices: {
            total_found: 0,
            hostnames_processed: []
        },
        deletion: {
            successful: 0,
            failed: 0,
            deleted_hostnames: [],
            failed_hostnames: []
        },
        errors: []
    };

    try {
        let token;
        try {
            token = await authenticate();
            result.auth.success = true;
            console.log('[CLEANUP] Авторизация успешна');
        } catch (err) {
            result.auth.success = false;
            result.auth.error_message = err.message;
            result.errors.push(`Ошибка авторизации: ${err.message}`);
            console.error('[CLEANUP] Ошибка авторизации:', err.message);
            return result;
        }

        let devices;
        try {
            devices = await getReservedDevices(token);
            result.devices.total_found = devices.length;
            result.devices.hostnames_processed = devices.map(d => d.hostname);
            console.log(`[CLEANUP] Найдено забронированных устройств: ${devices.length}`);
        } catch (err) {
            result.errors.push(`Ошибка получения устройств: ${err.message}`);
            console.error('[CLEANUP] Ошибка получения устройств:', err.message);
            return result;
        }

        if (devices.length === 0) {
            console.log('[CLEANUP] Нет забронированных устройств, очистка не требуется');
            return result;
        }

        for (const device of devices) {
            try {
                await deleteReservation(device.hostname, token);
                result.deletion.successful++;
                result.deletion.deleted_hostnames.push(device.hostname);
                console.log(`[CLEANUP] ✓ Бронь снята: ${device.hostname}`);
            } catch (err) {
                result.deletion.failed++;
                result.deletion.failed_hostnames.push(device.hostname);
                result.errors.push(`Ошибка удаления ${device.hostname}: ${err.message}`);
                console.error(`[CLEANUP] ✗ Не удалось снять бронь: ${device.hostname} — ${err.message}`);
            }
        }

    } finally {
        const endTime = new Date();
        result.timestamp_end = formatDate(endTime);
        result.duration_seconds = parseFloat(((endTime - startTime) / 1000).toFixed(2));

        console.log('\n[CLEANUP] ═══ Результат очистки ═══');
        console.log(JSON.stringify(result, null, 2));
    }

    return result;
}

function formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
         + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function checkSchedule() {
    try {
        const currentTime = await getTimeFromAPI();
        console.log(`[SCHEDULER] Текущее время (Екатеринбург): ${currentTime}`);

        const savedTime = await getSavedTime();

        if (!savedTime) {
            console.log('[SCHEDULER] Время не задано в schedule.json, пропускаем');
            return;
        }

        if (currentTime === savedTime) {
            if (!alreadyRanToday) {
                console.log(`[SCHEDULER] ⏰ Совпадение! ${currentTime} === ${savedTime}. Запускаем очистку...`);
                alreadyRanToday = true;
                lastMatchedTime = savedTime;
                await runCleanup();
            }
        } else {
            if (alreadyRanToday) {
                console.log(`[SCHEDULER] Минута прошла (${lastMatchedTime}), сброс флага`);
                alreadyRanToday = false;
                lastMatchedTime = null;
            }
        }

    } catch (err) {
        console.error(`[SCHEDULER] Ошибка получения времени: ${err.message}`);
    }
}

app.get('/schedule', async (req, res) => {
    try {
        const content = await fs.readFile(SCHEDULE_FILE, 'utf-8');
        const data = JSON.parse(content);
        res.json(data);
    } catch (err) {
        console.error('Ошибка чтения schedule.json:', err.message);
        res.status(500).json({ error: 'Не удалось прочитать расписание' });
    }
});

app.post('/schedule', async (req, res) => {
    const { time } = req.body;

    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: 'Ожидается время в формате HH:mm' });
    }

    try {
        const newData = { time };
        await fs.writeFile(SCHEDULE_FILE, JSON.stringify(newData, null, 2));

        alreadyRanToday = false;
        lastMatchedTime = null;
        console.log(`[API] Время расписания обновлено: ${time}`);

        res.json({ success: true, time });
    } catch (err) {
        console.error('Ошибка записи schedule.json:', err.message);
        res.status(500).json({ error: 'Не удалось сохранить время' });
    }
});

app.post('/run-cleanup', async (req, res) => {
    try {
        console.log('[API] Получен запрос на ручную очистку');
        const result = await runCleanup();
        res.json({ success: true, result });
    } catch (err) {
        console.error('[API] Непредвиденная ошибка при очистке:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, async () => {
    console.log(`Backend сервер запущен → http://localhost:${PORT}`);

    await ensureScheduleFile();

    console.log('[SCHEDULER] Автоматическая проверка запущена (интервал: 60 сек)');
    setInterval(checkSchedule, 60000);

    checkSchedule();
});