// app/Providers.tsx or components/Providers.tsx
"use client";

import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "@/components/ui/sonner";
import "../app/github-markdown.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Provider } from "react-redux";
import { store } from "../components/redux/store";
import { ResourceProvider } from "../components/NoteBlocks/context/Resource";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ResourceProvider> 
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          themes={["dark"]}
          disableTransitionOnChange
        >
          <TooltipProvider>
            <ProgressBar
              height="2px"
              color="#00000"
              options={{ showSpinner: false }}
              shallowRouting
            />
            {children}
          </TooltipProvider>
          <Toaster richColors />
        </ThemeProvider>
      </ResourceProvider> 
    </Provider>
  );
}