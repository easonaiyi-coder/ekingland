"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const COOKIE =
  "ekingland_auth=1; path=/; max-age=315360000; SameSite=Lax";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  // Permanent: a previous successful login is kept in localStorage
  // (no expiry). If the cookie has lapsed, restore it silently.
  useEffect(() => {
    try {
      if (localStorage.getItem("ekingland_auth") === "1") {
        document.cookie = COOKIE;
        router.push("/");
        router.refresh();
      }
    } catch {
      // storage unavailable: fall through to the password form
    }
  }, [router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === "ekingland") {
      try {
        localStorage.setItem("ekingland_auth", "1");
      } catch {
        // ignore
      }
      document.cookie = COOKIE;
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
