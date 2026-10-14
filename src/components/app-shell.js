"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import AppIcon from "@/components/app-icon";
import styles from "./app-shell.module.css";

const teacherLinks = [
  { href: "/dashboard", label: "الرئيسية", icon: "home" },
  { href: "/teacher/groups", label: "المجموعات", icon: "groups" },
  { href: "/teacher/students", label: "الطلاب", icon: "students" },
  { href: "/teacher/attendance", label: "الحضور", icon: "attendance" },
  { href: "/teacher/classrooms", label: "الحصص الأونلاين", icon: "video" },
  { href: "/teacher/payments", label: "الاشتراكات", icon: "payments" },
  { href: "/teacher/homework", label: "الواجبات", icon: "homework" },
  { href: "/teacher/exams", label: "الدرجات", icon: "exams" },
  { href: "/teacher/schedule", label: "الجدول", icon: "calendar" },
];

const studentLinks = [
  { href: "/dashboard", label: "الرئيسية", icon: "home" },
  { href: "/student/classrooms", label: "حصصي الأونلاين", icon: "video" },
];

export default function AppShell({ children, teacher = true }) {
  const pathname = usePathname();
  const links = teacher ? teacherLinks : studentLinks;
  const activeLink = links.find(
    ({ href }) => pathname === href || pathname?.startsWith(`${href}/`),
  );

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">انتقل للمحتوى</a>

      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand} aria-label="تطبيق المدرس، الرئيسية">
          <span className={styles.brandMark}><AppIcon name="book" size={25} /></span>
          <span className={styles.brandText}>
            <strong>تطبيق المدرس</strong>
            <span>{teacher ? "كل يوم دراسي، أسهل" : "رحلتك الدراسية في مكان واحد"}</span>
          </span>
        </Link>

        <nav className={styles.navigation} aria-label="القائمة الرئيسية">
          <p className={styles.navigationLabel}>{teacher ? "إدارة دروسك" : "متابعة دراستك"}</p>
          <div className={styles.links}>
            {links.map(({ href, label, icon }) => {
              const active = activeLink?.href === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${styles.navLink} ${active ? styles.active : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <AppIcon name={icon} size={21} />
                  <span>{label}</span>
                  {active && <span className={styles.activeDot} />}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className={styles.sidebarNote}>
          <span className={styles.noteIcon}><AppIcon name="sparkle" size={20} /></span>
          <strong>{teacher ? "مساحة لكل تفاصيل يومك" : "كل دروسك في مكان واحد"}</strong>
          <p>{teacher ? "حصصك وطلابك ومتابعتهم، في مكان واحد." : "الحضور والواجبات والدرجات، في مكان واحد."}</p>
        </div>

        <div className={styles.account}>
          <UserButton />
          <span className={styles.accountLabel}>
            <strong>{teacher ? "حساب المدرس" : "حساب الطالب"}</strong>
            <span>إدارة الحساب</span>
          </span>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <span>{teacher ? "مساحة المدرس" : "مساحة الطالب"}</span>
            <span className={styles.breadcrumbDivider} aria-hidden="true">/</span>
            <strong>{activeLink?.label ?? "الرئيسية"}</strong>
          </div>
          <span className={styles.topbarBadge}>
            <span aria-hidden="true" />
            {teacher ? "خطوة نحو يوم منظم" : "متابعة مستمرة"}
          </span>
        </header>

        <main id="main-content" className={`app-content ${styles.main}`} tabIndex={-1}>
          <div key={pathname} className={styles.routeEntry}>{children}</div>
        </main>
      </div>
    </div>
  );
}
