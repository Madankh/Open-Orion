"use client";

import { Suspense } from "react";
import AINotePad from "../../components/Home";
export default function Page() {
  return (
    <Suspense fallback={<></>}>
      <AINotePad/>
    </Suspense>
  );
}
