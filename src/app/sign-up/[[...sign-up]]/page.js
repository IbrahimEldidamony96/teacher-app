import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import AppIcon from "@/components/app-icon";

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><span className="dashboard-icon"><AppIcon name="book" size={24} /></span>تطبيق المدرس</Link>
      <div className="auth-content"><SignUp /></div>
    </main>
  );
}
