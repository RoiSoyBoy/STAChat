'use client';

import React from 'react';

interface RobotIconProps {
  className?: string;
}

export function RobotIcon({ className = '' }: RobotIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M19 6h-3V4c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v2H5c-1.103 0-2 .897-2 2v10c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V8c0-1.103-.897-2-2-2zM10 4h4v2h-4V4zM5 18V8h14l.002 10H5z"
      />
      <path
        fillRule="evenodd"
        d="M8 11h2v2H8zm6 0h2v2h-2zm-3 4h2v2h-2z"
      />
    </svg>
  );
} 