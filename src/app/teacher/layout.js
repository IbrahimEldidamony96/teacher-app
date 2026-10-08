import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const links = [
  ["/dashboard", "الرئيسية"],
  ["/teacher/groups", "المجموعات"],
  ["/teacher/students", "الطلاب"],
  ["/teacher/attendance", "الحضور"],
  ["/teacher/classrooms", "الفيديو والحصص"],
  ["/teacher/payments", "الاشتراكات"],
  ["/teacher/homework", "الواجبات"],
  ["/teacher/exams", "الدرجات"],
  ["/teacher/schedule", "الجدول"],
];

// No auth check here: layouts don't re-render on client navigation.
// Every page and server action under /teacher calls requireRole("TEACHER") itself.
export default function TeacherLayout({ children }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-gray-300 px-6 py-3">
        <nav className="flex flex-wrap gap-4 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="text-gray-500 hover:text-blue-600">
              {label}
            </Link>
          ))}
        </nav>
        <UserButton />
      </header>
      <div className="mx-auto max-w-4xl p-6">{children}</div>
    </div>
  );
}
