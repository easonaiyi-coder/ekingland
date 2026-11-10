"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === "ekingland") {
      document.cookie =
        "ekingland_auth=1; path=/; max-age=31536000; SameSite=Lax";
      router.push("/");
      router.refresh();
    } else {
      setErr("密码不对，再试一次");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f5f8] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-lg font-bold">全球市场看板</h1>
        <p className="mt-1 text-xs text-slate-500">请输入访问密码</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr("");
          }}
          placeholder="密码"
          autoFocus
          className="mt-5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          进入
        </button>
      </form>
    </main>
  );
}
