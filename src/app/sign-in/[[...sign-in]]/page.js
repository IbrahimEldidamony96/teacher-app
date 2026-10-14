import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import AppIcon from "@/components/app-icon";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><span className="dashboard-icon"><AppIcon name="book" size={24} /></span>تطبيق المدرس</Link>
      <div className="auth-content"><SignIn /></div>
    </main>
  );
}
