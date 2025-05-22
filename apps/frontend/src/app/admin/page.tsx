"use client";

import dynamic from "next/dynamic";
import React from "react";

// Define a loading component for the dashboard content
const AdminDashboardLoading = () => (
  <div
    className="min-h-screen bg-gray-50 flex items-center justify-center"
    dir="rtl"
  >
    <div className="flex flex-col items-center">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
      <p className="text-gray-600">טוען לוח ניהול...</p>
    </div>
  </div>
);

// Dynamically import the AdminDashboardContent component
const DynamicAdminDashboardContent = dynamic(
  () => import("./AdminDashboardContent").then((mod) => mod.default),
  {
    ssr: false, // Can be true if AdminDashboardContent is SSR-safe after changes
    loading: () => <AdminDashboardLoading />,
  }
);

// The page component now just renders the dynamically imported content
export default function AdminPage() {
  // Props for AdminDashboardContent can be passed here if needed,
  // for example, if they come from server components or page params.
  // For now, assuming default props are handled within AdminDashboardContent.
  return <DynamicAdminDashboardContent />;
}
