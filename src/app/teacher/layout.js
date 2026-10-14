import AppShell from "@/components/app-shell";

// No auth check here: layouts don't re-render on client navigation.
// Every page and server action under /teacher calls requireRole("TEACHER") itself.
export default function TeacherLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
