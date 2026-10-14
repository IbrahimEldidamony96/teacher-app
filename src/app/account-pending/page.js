import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
export default function AccountPendingPage(){
return <main className="auth-page"><div className="ui-panel mx-auto max-w-lg space-y-4 p-6">
<h1 className="text-2xl font-bold">الحساب غير مفعّل</h1>
<p>لا يمكن عرض بيانات أي طالب قبل أن يحدد المدرس بريد حسابه ويؤكد الطالب ملكية البريد. اطلب من المدرس إضافة بريدك إلى ملف الطالب.</p>
<Link href="/dashboard" className="text-blue-600 underline">إعادة المحاولة بعد ربط الحساب</Link>
<SignOutButton><button className="ui-button-secondary">تسجيل خروج</button></SignOutButton>
</div></main>;
}
