import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppIcon from "@/components/app-icon";
import styles from "./welcome.module.css";

const features = [
  { icon: "calendar", title: "حصصك مرتبة", description: "نظّم مواعيد الحصص والمجموعات، واعرف ما ينتظرك في يومك." },
  { icon: "attendance", title: "الحضور واضح", description: "سجّل حضور الطلاب وتابع الغياب بسهولة، حصة بعد حصة." },
  { icon: "payments", title: "الاشتراكات تحت المتابعة", description: "تابع مدفوعات الطلاب واشتراكاتهم، واحتفظ بكل التفاصيل." },
];

function CheckIcon({ className }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6" /></svg>;
}

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="تطبيق المدرس - الصفحة الرئيسية">
          <span className={styles.brandIcon}><AppIcon name="book" size={24} /></span>
          <span>تطبيق المدرس<span className={styles.brandCaption}>رفيق يومك الدراسي</span></span>
        </Link>
        <Link href="/sign-in" className={styles.headerLink}>تسجيل الدخول<AppIcon name="arrow" size={18} /></Link>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="welcome-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><span className={styles.eyebrowDot} />تنظيم أبسط، تركيز أكبر</span>
            <h1 id="welcome-title">كل تفاصيل حصصك،<br /><span>في مكان واحد.</span></h1>
            <p className={styles.intro}>من أول حصة إلى آخر اشتراك. مساحة تجمع مواعيدك وطلابك وحضورهم، لتمنح التدريس وقتك واهتمامك.</p>
            <div className={styles.actions}>
              <Link href="/sign-up" className={styles.primaryLink}>ابدأ بإنشاء حساب<AppIcon name="arrow" size={19} /></Link>
              <Link href="/sign-in" className={styles.secondaryLink}>لديّ حساب بالفعل</Link>
            </div>
            <p className={styles.heroNote}><CheckIcon />حصص، حضور، واشتراكات. كل شيء أقرب إليك.</p>
          </div>

          <div className={styles.visual} aria-hidden="true">
            <div className={styles.visualBackdrop} />
            <div className={styles.orbitDot} />
            <div className={styles.planner}>
              <div className={styles.plannerHeader}>
                <span className={styles.plannerBrand}><span className={styles.smallBrandIcon}><AppIcon name="book" size={16} /></span>تطبيق المدرس</span>
                <span className={styles.exampleLabel}>مثال توضيحي</span>
              </div>
              <div className={styles.plannerBody}>
                <div className={styles.plannerTitle}><div><span className={styles.plannerCaption}>مساحة لكل تفاصيل يومك</span><h2>يوم دراسي منظم</h2></div><span className={styles.calendarIcon}><AppIcon name="calendar" /></span></div>
                <div className={styles.week}>
                  {["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء"].map((day, index) => <span className={index === 2 ? styles.activeDay : styles.day} key={day}>{day}<span className={styles.dayDot} /></span>)}
                </div>
                <div className={styles.lesson}>
                  <span className={styles.lessonIcon}><AppIcon name="book" size={19} /></span>
                  <div className={styles.lessonCopy}><strong>الحصة القادمة</strong><span>مواعيدك ومجموعاتك في نظرة واحدة</span></div>
                  <span className={styles.lessonMarker} />
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewIcon}><AppIcon name="attendance" size={19} /></span>
                  <div><strong>متابعة الحضور</strong><span>كل طالب، كل حصة</span></div>
                  <span className={styles.checkIcon}><CheckIcon /></span>
                </div>
                <div className={styles.previewRow}>
                  <span className={`${styles.previewIcon} ${styles.paymentIcon}`}><AppIcon name="payments" size={19} /></span>
                  <div><strong>اشتراكات الطلاب</strong><span>تفاصيل واضحة وسهلة المتابعة</span></div>
                  <span className={styles.previewLine} />
                </div>
              </div>
            </div>
            <div className={styles.floatingNote}><span><AppIcon name="sparkle" /></span><div><strong>مساحة أكبر للتدريس</strong><span>وتفاصيل أقل تشغل بالك</span></div></div>
          </div>
        </section>

        <section className={styles.features} aria-labelledby="features-title">
          <div className={styles.featureHeading}><span className={styles.sectionEyebrow}>يومك الدراسي، ببساطة</span><h2 id="features-title">التفاصيل الصغيرة تصنع الفرق.</h2></div>
          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <article className={styles.featureCard} key={feature.icon}>
                <span className={styles.featureIcon}><AppIcon name={feature.icon} size={24} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}><span>تطبيق المدرس</span><p>وقت أقل في التنظيم، ومساحة أكبر للتدريس.</p></footer>
    </div>
  );
}
