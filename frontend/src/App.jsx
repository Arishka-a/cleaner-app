import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [time, setTime] = useState('03:00');
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const lastNotifRef = useRef({ message: '', time: 0 });

  useEffect(() => {
    fetch(`${API_URL}/schedule`)
      .then(res => res.json())
      .then(data => {
        if (data.time) setTime(data.time);
      })
      .catch(() => showNotification('Не удалось загрузить расписание', 'error'));
  }, []);

  function showNotification(message, type = 'success') {
    const now = Date.now();
    const last = lastNotifRef.current;

    if (last.message === message && now - last.time < 3300) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    lastNotifRef.current = { message, time: now };
    setNotification({ message, type });

    timerRef.current = setTimeout(() => {
      setNotification(null);
      timerRef.current = null;
    }, 3000);
  }

  async function handleSaveTime() {
    try {
      const res = await fetch(`${API_URL}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time })
      });
      const data = await res.json();

      if (data.success) {
        showNotification(`Время сохранено: ${data.time}`);
      } else {
        showNotification(data.error || 'Ошибка сохранения', 'error');
      }
    } catch {
      showNotification('Сервер недоступен', 'error');
    }
  }

  async function handleRunCleanup() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/run-cleanup`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const r = data.result;
        const msg = `Очистка завершена. Найдено: ${r.devices.total_found}, удалено: ${r.deletion.successful}, ошибок: ${r.deletion.failed}`;
        showNotification(msg, r.deletion.failed > 0 ? 'warning' : 'success');
      } else {
        showNotification(data.error || 'Ошибка очистки', 'error');
      }
    } catch {
      showNotification('Сервер недоступен', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="wrapper">
        <h1 className="title">Очистка устройств</h1>
        <div className="card">
          <p className="label">Время автоматической очистки</p>

          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="time-input"
          />

          <button className="btn btn-save" onClick={handleSaveTime}>
            Сохранить
          </button>

          <button
            className="btn btn-cleanup"
            onClick={handleRunCleanup}
            disabled={loading}
          >
            {loading ? 'Выполняется...' : 'Запуск очистки'}
          </button>
        </div>

        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;