const icons = {
  book: <><path d="M12 6.5c-2.7-2-6.1-2.4-9-1.5v14c2.9-.9 6.3-.5 9 1.5 2.7-2 6.1-2.4 9-1.5V5c-2.9-.9-6.3-.5-9 1.5Z" /><path d="M12 6.5v14" /></>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
  groups: <><circle cx="9" cy="7" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 4.6V20" /></>,
  students: <><path d="m2 8 10-5 10 5-10 5-10-5Z" /><path d="M6 10v6c3 3 9 3 12 0v-6M22 8v7" /></>,
  attendance: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4m-8 8 3 3 5-6" /></>,
  video: <><rect x="3" y="5" width="12" height="14" rx="3" /><path d="m15 10 6-4v12l-6-4" /></>,
  payments: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></>,
  homework: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8m-8 4h5" /></>,
  exams: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6m-12 7 3 3 5-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2m-8 3h2" /></>,
  arrow: <><path d="M19 12H5m6-6-6 6 6 6" /></>,
  sparkle: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
};

export default function AppIcon({ name, size = 20, className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {icons[name] ?? icons.book}
    </svg>
  );
}
