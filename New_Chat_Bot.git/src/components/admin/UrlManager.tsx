import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UrlManagerProps {
  userId: string;
}

export default function UrlManager({ userId }: UrlManagerProps) {
  const [url, setUrl] = useState('');
  const [urls, setUrls] = useState<Array<{ id: string; url: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const fetchUrls = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, `users/${userId}/urls`));
        setUrls(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      } catch (e) {
        toast.error('שגיאה בטעינת כתובות');
      } finally {
        setLoading(false);
      }
    };
    fetchUrls();
  }, [userId]);

  const handleAdd = async () => {
    if (!url.trim()) {
      toast.error('יש להזין כתובת URL');
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      toast.error('כתובת URL לא תקינה');
      return;
    }
    setAdding(true);
    // Fallback: always reset after 10 seconds
    const timeout = setTimeout(() => setAdding(false), 10000);
    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'שגיאה בהוספת כתובת');
      } else {
        // Instead of adding directly, refresh from Firestore
        const snap = await getDocs(collection(db, `users/${userId}/urls`));
        setUrls(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        setUrl('');
        toast.success('הכתובת נוספה בהצלחה');
      }
    } catch (e) {
      toast.error('שגיאה בהוספת כתובת');
    } finally {
      clearTimeout(timeout);
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteDoc(doc(db, `users/${userId}/urls`, id));
      setUrls(urls => urls.filter(u => u.id !== id));
      toast.success('הכתובת הוסרה');
    } catch (e) {
      toast.error('שגיאה בהסרת כתובת');
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex gap-2">
        <input
          type="url"
          className="input input-bordered w-full rtl text-right"
          placeholder="הכנס כתובת URL"
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={adding}
        />
        <button
          className="btn btn-primary transition active:scale-95 disabled:opacity-50"
          onClick={handleAdd}
          disabled={adding}
        >
          הוסף
        </button>
      </div>
      <ul className="space-y-2">
        {loading ? (
          <li>טוען...</li>
        ) : urls.length === 0 ? (
          <li className="text-gray-400">לא נוספו כתובות</li>
        ) : (
          urls.map(u => (
            <li key={u.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
              <span className="truncate text-right">{u.url}</span>
              <button className="btn btn-xs btn-error" onClick={() => handleRemove(u.id)}>הסר</button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
} 