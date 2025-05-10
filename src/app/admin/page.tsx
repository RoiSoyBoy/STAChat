'use client';

import React from 'react';
import { Card } from '@/components/admin/Card';
import { FileUpload } from '@/components/admin/FileUpload';
import UrlManager from '@/components/admin/UrlManager';
import SettingsForm from '@/components/admin/SettingsForm';
import IngestUrlButton from './IngestUrlButton';

// TODO: Replace with real userId from auth context
const userId = 'admin';

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-0 flex flex-col items-center" dir="rtl">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <h2 className="text-3xl font-bold text-gray-900">הגדרות צ׳אט בוט</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card title="הגדרות כלליות">
            <SettingsForm userId={userId} />
          </Card>
          <Card title="ניהול מסמכים">
            <FileUpload userId={userId} />
          </Card>
        </div>
        <Card title="רשימת כתובות URL">
          <UrlManager userId={userId} />
        </Card>
        <IngestUrlButton />
      </div>
    </div>
  );
} 