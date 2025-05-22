import React, { useState, useEffect } from 'react';
import Image from 'next/image'; // Import next/image
import { toast } from 'react-toastify';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SettingsFormProps {
  userId: string;
}

export default function SettingsForm({ userId }: SettingsFormProps) {
  const [color, setColor] = useState('#0066cc');
  const [logoUrl, setLogoUrl] = useState('');
  const [greeting, setGreeting] = useState('שלום! איך אפשר לעזור?');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [botName, setBotName] = useState('');
  const [tone, setTone] = useState('formal');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [description, setDescription] = useState('');
  const [introMessage, setIntroMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, `users/${userId}/settings/main`));
        if (snap.exists()) {
          const data = snap.data();
          setColor(data.primaryColor || '#0066cc');
          setLogoUrl(data.logoUrl || '');
          setGreeting(data.greeting || 'שלום! איך אפשר לעזור?');
          setBotName(data.botName || '');
          setTone(data.tone || 'formal');
          setAvatarUrl(data.avatarUrl || '');
          setDescription(data.description || '');
          setIntroMessage(data.introMessage || '');
        }
      } catch (e) {
        toast.error('שגיאה בטעינת הגדרות');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [userId]);

  const handleSave = async () => {
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      toast.error('יש להזין צבע HEX תקין');
      return;
    }
    if (!greeting.trim()) {
      toast.error('יש להזין ברכת פתיחה');
      return;
    }
    if (avatarUrl && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(avatarUrl)) {
      toast.error('יש להזין קישור תמונה תקין');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${userId}/settings/main`), {
        primaryColor: color,
        logoUrl,
        greeting,
        botName,
        tone,
        avatarUrl,
        description,
        introMessage,
      });
      toast.success('ההגדרות נשמרו בהצלחה');
    } catch (e) {
      toast.error('שגיאה בשמירת הגדרות');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" className="space-y-4 max-w-md mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-xl font-bold mb-2 text-right">הגדרות כלליות</h2>
      {loading ? (
        <div>טוען...</div>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="color">צבע ראשי</label>
            <input
              id="color"
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-16 h-8 border rounded"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="logo">לוגו (קישור לתמונה)</label>
            <input
              id="logo"
              type="url"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              className="input input-bordered"
              placeholder="https://example.com/logo.png"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="greeting">ברכת פתיחה</label>
            <input
              id="greeting"
              type="text"
              value={greeting}
              onChange={e => setGreeting(e.target.value)}
              className="input input-bordered"
              placeholder="שלום! איך אפשר לעזור?"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="botName">שם הבוט</label>
            <input
              id="botName"
              type="text"
              value={botName}
              onChange={e => setBotName(e.target.value)}
              className="input input-bordered"
              placeholder="הבוט שלי"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="tone">טון דיבור</label>
            <select
              id="tone"
              value={tone}
              onChange={e => setTone(e.target.value)}
              className="input input-bordered"
              disabled={saving}
            >
              <option value="formal">רשמי</option>
              <option value="casual">קליל</option>
              <option value="humorous">הומוריסטי</option>
            </select>
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="avatarUrl">תמונת בוט (קישור)</label>
            <input
              id="avatarUrl"
              type="url"
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              className="input input-bordered"
              placeholder="https://example.com/bot.png"
              disabled={saving}
            />
            {avatarUrl && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(avatarUrl) && (
              <Image 
                src={avatarUrl} 
                alt="Bot Avatar" 
                width={64} // h-16 w-16 => 4rem * 16px/rem = 64px
                height={64}
                className="rounded-full border mt-2 mx-auto" 
              />
            )}
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="description">תיאור הבוט</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input input-bordered"
              placeholder="תאר את הבוט בקצרה..."
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2 text-right">
            <label htmlFor="introMessage">הודעת פתיחה</label>
            <textarea
              id="introMessage"
              value={introMessage}
              onChange={e => setIntroMessage(e.target.value)}
              className="input input-bordered"
              placeholder="שלום! אני כאן כדי לעזור."
              disabled={saving}
            />
            {introMessage && (
              <div className="mt-1 text-xs text-gray-500">תצוגה מקדימה: {introMessage}</div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary w-full mt-4"
            onClick={handleSave}
            disabled={saving}
          >
            שמור הגדרות
          </button>
        </>
      )}
    </form>
  );
}
