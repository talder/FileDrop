"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/login", "/setup"];
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return;

    const check = () => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((data) => {
          if (data.needsSetup) router.replace("/setup");
          else if (!data.user) router.replace("/login");
        })
        .catch(() => {});
    };

    intervalRef.current = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [pathname, router]);

  return null;
}
