"use client";
import { useActionState } from "react";
import { setStudentLoginEmailAction } from "@/app/teacher/student-actions";
import { input, button } from "@/app/teacher/ui";

export default function StudentLoginForm({ studentId, loginEmail }) {
  const [state, action, pending] = useActionState(setStudentLoginEmailAction, { message: "", success: false });
  return <form action={action} className="ui-form flex flex-wrap items-end gap-2" aria-busy={pending}>
    <input type="hidden" name="studentId" value={studentId}/>
    <label className="flex flex-col gap-1 text-sm">البريد الإلكتروني
      <input type="email" name="loginEmail" defaultValue={loginEmail ?? ""} maxLength={254}
        className={input} placeholder="student@example.com" disabled={pending}/>
    </label>
    <button className={button} type="submit" disabled={pending}>{pending ? "جاري الحفظ..." : "حفظ حساب الطالب"}</button>
    {state?.message && <p className={`w-full text-sm ${state.success ? "text-green-600" : "text-red-600"}`}
      role={state.success ? "status" : "alert"}>{state.message}</p>}
  </form>;
}
