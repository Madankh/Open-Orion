"use client";
import React, { useState, useEffect } from "react";
import {
  Flame,
  Megaphone,
  TrendingUp,
  Search,
  BookOpen,
  Check,
  ArrowRight,
  Sparkles,
  Users,
  Lightbulb,
} from "lucide-react";

// --- Types ---
type WorkflowKey = "research" | "writing" | "learning" | "thinking" | "collaborate";

// --- Data ---
const workflows: Record<
  WorkflowKey,
  {
    id: WorkflowKey;
    label: string;
    icon: any;
    color: string; // Icon color
    glow: string; // Background glow color
    borderColor: string;
    headline: string;
    subHeadline: string;
    benefit1: { title: string; desc: string };
    benefit2: { title: string; desc: string };
  }
> = {
  research: {
    id: "research",
    label: "Research",
    icon: Search,
    color: "text-blue-400",
    glow: "bg-blue-500",
    borderColor: "border-blue-500/30",
    headline: "From scattered sources to connected insights",
    subHeadline: "Linear research → Visual connections",
    benefit1: {
      title: "Linear: Deep research with AI agents",
      desc: "AI agents do multi-step research across PDFs and web. Whiteboard for visualize concept. Save insights to knowledge library with one click.",
    },
    benefit2: {
      title: "Canvas: See how it all connects",
      desc: "Pull your knowledge into visual canvas. Branch ideas, connect across topics, spot relationships. Drag between Linear and Canvas seamlessly.",
    },
  },
  
  writing: {
    id: "writing",
    label: "Writing",
    icon: BookOpen,
    color: "text-purple-400",
    glow: "bg-purple-500",
    borderColor: "border-purple-500/30",
    headline: "From research to finished writing",
    subHeadline: "Outline visually, write in context.",
    benefit1: {
      title: "Canvas: Map your entire structure",
      desc: "Organize sources, quotes, and arguments visually. Branch themes into subthemes. See your whole outline at a glance.",
    },
    benefit2: {
      title: "Linear: Write with full context",
      desc: "Chat with AI, gather sources, save key insights to knowledge library. Built in editor lets you write while staying in context.",
    },
  },
  
  learning: {
    id: "learning",
    label: "Learning",
    icon: Sparkles,
    color: "text-emerald-400",
    glow: "bg-emerald-500",
    borderColor: "border-emerald-500/30",
    headline: "Build your second brain",
    subHeadline: "Capture, connect, and retain knowledge.",
    benefit1: {
      title: "Capture from anywhere",
      desc: "YouTube videos with timestamped notes, PDFs with highlights, lecture notes. Everything saves to your knowledge library.",
    },
    benefit2: {
      title: "Visual connections = deeper understanding",
      desc: "Link concepts across different sources. Your brain remembers better when ideas are spatially connected, not linear lists.",
    },
  },
  
  thinking: {
    id: "thinking",
    label: "Thinking",
    icon: Lightbulb, // Changed from TrendingUp - more appropriate
    color: "text-orange-400",
    glow: "bg-orange-500",
    borderColor: "border-orange-500/30",
    headline: "Explore ideas without getting lost",
    subHeadline: "Branch, explore, and synthesize.",
    benefit1: {
      title: "Infinite branching from one question",
      desc: "Ask AI a question, explore multiple paths. Each branch can split again. Never hit a dead end or lose your train of thought.",
    },
    benefit2: {
      title: "AI with full canvas context",
      desc: "Select any node or group and ask questions. AI sees everything you've explored, giving deeper answers than isolated chat.",
    },
  },
  
  collaborate: {
    id: "collaborate",
    label: "Teams",
    icon: Users,
    color: "text-yellow-400",
    glow: "bg-yellow-500",
    borderColor: "border-yellow-500/30",
    headline: "Shared canvas, shared understanding",
    subHeadline: "Real-time collaboration that actually works.",
    benefit1: {
      title: "See what your team is thinking",
      desc: "Everyone works on the same Linear chats and Canvas nodes in real-time. Context is visible, not buried in Slack threads.",
    },
    benefit2: {
      title: "Bring your own API keys",
      desc: "Each person uses GPT-4, Claude, or Gemini with their own key. No centralized billing, no data pooling.",
    },
  },
};

const bottomFeatures = [
  "Multimodal canvas",
  "AI-assisted reasoning",
  "Live collaboration",
  "Built-in document editor",
];

export default function WorkflowsSection() {
  const [activeTab, setActiveTab] = useState<WorkflowKey>("thinking");
  const currentData = workflows[activeTab];

  // Helper to handle smooth fading
  const [isFading, setIsFading] = useState(false);
  const handleTabChange = (key: WorkflowKey) => {
    if (key === activeTab) return;
    setIsFading(true);
    setTimeout(() => {
      setActiveTab(key);
      setIsFading(false);
    }, 200);
  };

  return (
    <section className="bg-[#030303] py-24 px-4 md:px-8 w-full font-sans relative overflow-hidden min-h-screen flex flex-col justify-center">
      {/* --- Dynamic Background Atmosphere --- */}
      <div className="absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out">
        {/* Dynamic colored glow based on active tab */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] blur-[120px] opacity-20 transition-colors duration-1000 ${currentData.glow}`}
        />
        {/* Noise overlay for texture */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#030303] via-transparent to-[#030303]" />
      </div>

      <div className="max-w-6xl mx-auto flex flex-col items-center relative z-10">
        
        {/* --- Header --- */}
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-gray-400 mb-2">
            <Sparkles size={12} className="text-yellow-200" />
            <span>Workflow Engine</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.1]">
            One workspace. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-400 via-gray-200 to-gray-500">
              Many ways to think.
            </span>
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Switch contexts without switching tools. A unified environment for every stage of your work.
          </p>
        </div>

        {/* --- Navigation Tabs --- */}
        <div className="bg-white/5 border border-white/10 p-1.5 rounded-2xl mb-12 flex flex-wrap justify-center gap-1 backdrop-blur-md shadow-2xl relative">
          {(Object.keys(workflows) as WorkflowKey[]).map((key) => {
            const item = workflows[key];
            const isActive = activeTab === key;
            const Icon = item.icon;

            return (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 group
                  ${isActive ? "text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}
                `}
              >
                {/* Active Tab Background (Glassy Highight) */}
                {isActive && (
                  <div className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-sm backdrop-blur-sm" />
                )}
                
                <span className="relative z-10 flex items-center gap-2">
                  <Icon
                    size={16}
                    className={`transition-colors duration-300 ${isActive ? item.color : "text-gray-500 group-hover:text-gray-400"}`}
                  />
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- Main Feature Card --- */}
        <div className="w-full relative group">
          {/* Decorative gradients behind card */}
          <div className={`absolute -inset-1 rounded-[32px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-lg`} />
          
          <div
            className={`relative bg-[#0A0A0A] rounded-[30px] border transition-colors duration-500 overflow-hidden shadow-2xl ${currentData.borderColor}`}
          >
             {/* Inner Grid */}
            <div 
               className={`grid grid-cols-1 lg:grid-cols-12 min-h-[480px] transition-opacity duration-200 ${isFading ? 'opacity-50 blur-sm' : 'opacity-100 blur-0'}`}
            >
              
              {/* Left Column: Headline & CTA */}
              <div className="lg:col-span-7 p-8 md:p-14 flex flex-col justify-between relative z-10">
                <div className="space-y-6">
                  {/* Icon Badge */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 ${currentData.color}`}>
                     <currentData.icon size={24} />
                  </div>

                  <div>
                    <h3 className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight">
                        {currentData.headline}
                    </h3>
                    <p className="text-xl text-gray-400 font-medium">
                        {currentData.subHeadline}
                    </p>
                  </div>
                </div>

                <div className="mt-12">
                   <a href="/login">
                  <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-white px-8 font-medium text-black transition-all duration-300 hover:bg-gray-200 hover:w-full sm:hover:w-auto">
                    <span className="mr-2">Get started for free</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-gray-200 via-gray-100 to-white opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  </button>
                  </a>
                </div>
              </div>

              {/* Right Column: Benefits Visuals */}
              <div className="lg:col-span-5 relative bg-white/[0.02] border-t lg:border-t-0 lg:border-l border-white/5 p-8 md:p-14 flex flex-col justify-center gap-10">
                {/* Background Pattern for Right Side */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
                
                <div className="relative z-10 space-y-8">
                  <div className="group/item">
                    <h4 className={`text-lg font-semibold text-gray-100 mb-2 flex items-center gap-2 group-hover/item:${currentData.color} transition-colors`}>
                      <span className="bg-white/10 p-1 rounded">1</span>
                      {currentData.benefit1.title}
                    </h4>
                    <p className="text-gray-500 leading-relaxed text-sm">
                      {currentData.benefit1.desc}
                    </p>
                  </div>
                  
                  <div className="w-full h-px bg-white/10" />

                  <div className="group/item">
                     <h4 className={`text-lg font-semibold text-gray-100 mb-2 flex items-center gap-2 group-hover/item:${currentData.color} transition-colors`}>
                      <span className="bg-white/10 p-1 rounded">2</span>
                      {currentData.benefit2.title}
                    </h4>
                    <p className="text-gray-500 leading-relaxed text-sm">
                      {currentData.benefit2.desc}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* --- Footer Features --- */}
        <div className="mt-16 flex flex-wrap justify-center gap-4 md:gap-8 opacity-70 hover:opacity-100 transition-opacity">
          {bottomFeatures.map((feature) => (
            <div key={feature} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-default">
              <div className="text-green-400">
                <Check size={14} strokeWidth={3} />
              </div>
              <span className="text-sm font-medium text-gray-400">{feature}</span>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}