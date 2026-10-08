import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">تطبيق المدرس</h1>
      <p className="text-gray-500">الحصص والحضور والاشتراكات في مكان واحد.</p>
      <div className="flex gap-3">
        <Link href="/sign-in" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          تسجيل الدخول
        </Link>
        <Link href="/sign-up" className="rounded border border-gray-400 px-4 py-2">
          إنشاء حساب
        </Link>
      </div>
    </main>
  );
}
