"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function CuriosityLab({ } = {}) {
  const reduceMotion = useReducedMotion();
  const fullText = "Curiosity Begins Here";
  const [typed, setTyped] = useState(reduceMotion ? fullText : "");

  // useEffect(() => {
  //   if (reduceMotion) return;
  //   let i = 0;
  //   const t = setInterval(() => {
  //     setTyped((p) => (fullText[i] ? p + fullText[i] : p));
  //     i += 1;
  //     if (i >= fullText.length) clearInterval(t);
  //   }, 28);
  //   return () => clearInterval(t);
  // }, [reduceMotion]);

  const blobAnim = reduceMotion
    ? undefined
    : {
        animate: { x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] },
        transition: { duration: 10, repeat: Infinity, ease: "easeInOut" },
      };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-black text-slate-100 overflow-hidden">
      {/* decorative animated gradient blobs (pointer-events-none for performance) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          className="absolute -left-40 -top-40 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-60"
          style={{
            background: "radial-gradient(closest-side, rgba(99,102,241,0.22), transparent)",
          }}
          {...(blobAnim || {})}
        />

        <motion.div
          className="absolute right-[-6rem] top-[-6rem] w-[28rem] h-[28rem] rounded-full blur-3xl opacity-50"
          style={{
            background: "radial-gradient(closest-side, rgba(236,72,153,0.18), transparent)",
          }}
          {...(blobAnim || {})}
        />

        <motion.div
          className="absolute left-1/2 bottom-[-10rem] -translate-x-1/2 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-30"
          style={{
            background: "radial-gradient(closest-side, rgba(249,115,22,0.12), transparent)",
          }}
          {...(blobAnim || {})}
        />
      </div>

      {/* Main card */}
      <main className="relative z-10 w-full max-w-3xl p-6">
        <section
          className="mx-auto rounded-3xl p-8 sm:p-12 backdrop-blur-md bg-gradient-to-br from-white/3 to-white/2 border border-white/6 shadow-lg text-center"
          aria-labelledby="curiosity-title"
        >
          <div className="flex items-center justify-center mb-6">
            <motion.div
              whileHover={{ rotate: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 1.06 }}
              transition={{ type: "spring", stiffness: 120 }}
              className="rounded-full p-3 bg-white/5"
            >
              <Sparkles size={26} aria-hidden />
            </motion.div>
          </div>

          <motion.h1
            id="curiosity-title"
            className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-pink-400 to-yellow-300 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            {typed || fullText}
          </motion.h1>

          <motion.p
            className="mt-4 max-w-2xl mx-auto text-sm sm:text-base text-slate-300 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
          >
            A playground for your work
          </motion.p>

          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              className="rounded-full p-2 border border-white/8 bg-white/3 hover:bg-white/4 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400/30 transition-colors duration-200"
              onClick={() => alert("Tip: try keyboard navigation and reduced motion preference to test accessibility.")}
              aria-label="Tips"
              title="Tips"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M9 2a7 7 0 00-3 13.326V18a1 1 0 001.447.894L9 17.618l1.553.276A1 1 0 0012 18v-2.674A7 7 0 009 2z" />
              </svg>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}