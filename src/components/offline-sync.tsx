"use client";
import { useEffect, useState } from "react";
import { flushEntries, readQueue } from "@/lib/offline";

export function OfflineSync() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const refresh = () => { setCount(readQueue().length); setOnline(navigator.onLine); };
    const go = () => { refresh(); if (navigator.onLine) flushEntries().then(refresh); };
    void go();
    window.addEventListener("online", go);
    window.addEventListener("offline", refresh);
    window.addEventListener("acct-queue", refresh);
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", refresh); window.removeEventListener("acct-queue", refresh); };
  }, []);
  if (online && !count) return null;
  return (
    <div className="no-print fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs text-white shadow md:bottom-4">
      {!online ? "Offline — entries will be saved on this phone" : `${count} offline item${count > 1 ? "s" : ""} waiting — open Add to finish`}
    </div>
  );
}
