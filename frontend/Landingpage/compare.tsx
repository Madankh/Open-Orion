"use client";
import React from "react";
import {
  X,
  Check,
  MessageSquare,
  Layout,
  GitBranch,
  Database,
  Layers,
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";

export default function ComparisonSection() {
  return (
    <section className="bg-[#030303] py-24 px-4 md:px-8 w-full relative overflow-hidden font-sans selection:bg-orange-500/30">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 right-0 md:right-1/4 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-400 uppercase tracking-wider">
            <Zap size={12} fill="currentColor" />
            Curiositylab
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
            AI got smarter. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-500 to-gray-700">
              The interface didn't.
            </span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Chat interfaces force you into linear thinking. 
            CuriosityLab gives you space to branch, connect, and see the full picture.
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-start relative">
          
          {/* Middle VS Badge */}
          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-[#0A0A0A] border border-white/10 rounded-full items-center justify-center shadow-xl">
            <span className="text-xs font-black text-gray-500">VS</span>
          </div>

          {/* LEFT — Standard Chat AI */}
          <div className="relative group opacity-80 hover:opacity-100 transition-opacity duration-300">
            <div className="h-full bg-white/[0.02] rounded-3xl border border-white/5 p-8 flex flex-col relative overflow-hidden grayscale hover:grayscale-0 transition-all">
              
              {/* Card Header */}
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5">
                  <MessageSquare size={20} className="text-gray-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-300">ChatGPT / Claude Chat</h3>
                  <p className="text-sm text-gray-500">The ephemeral scroll</p>
                </div>
              </div>

              {/* Pain Points */}
              <div className="space-y-6">
                <PainPoint 
                  title="Lost in chat history" 
                  desc="Yesterday's insights disappear into endless scroll. You re-explain context every new session." 
                />
                <PainPoint 
                  title="Can't see connections" 
                  desc="How does Paper A relate to Paper B? You have to remember. The AI can't show you visually." 
                />
                <PainPoint 
                  title="One path only" 
                  desc="Linear conversations force you forward. Can't explore multiple angles without losing your place." 
                />
                <PainPoint 
                  title="Locked to one model" 
                  desc="Want to switch from GPT-4 to Claude? Start over in a new tool. Your context doesn't transfer." 
                />
              </div>

              <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[#030303] to-transparent pointer-events-none" />
            </div>
          </div>

          {/* RIGHT — CuriosityLab */}
          <div className="relative lg:scale-105 transform transition-transform duration-500 z-10">
            <div className="absolute -inset-[1px] bg-gradient-to-b from-orange-500 via-orange-500/40 to-transparent rounded-[32px] opacity-100 blur-sm" />
            
            <div className="h-full bg-[#0F0F0F] rounded-[30px] border border-white/10 p-8 md:p-10 flex flex-col relative overflow-hidden shadow-2xl">
              
              {/* Featured Badge */}
              <div className="absolute top-0 right-0 px-4 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-bl-2xl">
                RECOMMENDED
              </div>

              {/* Card Header */}
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Layout size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">CuriosityLab</h3>
                  <p className="text-sm text-orange-200/70">Linear + Canvas Workspaces</p>
                </div>
              </div>

              {/* Benefits */}
              <div className="space-y-5">
                <BenefitPoint 
                  icon={<Database size={16} />}
                  title="Persistent knowledge library" 
                  desc="Save insights to your knowledge space. Access from Linear or Canvas anytime. Nothing gets lost in chat history." 
                />
                <BenefitPoint 
                  icon={<GitBranch size={16} />}
                  title="Visual branching & connections" 
                  desc="One question spawns multiple exploration paths. Connect ideas across sources. See relationships at a glance on Canvas." 
                />
                <BenefitPoint 
                  icon={<Layers size={16} />}
                  title="Two workspaces, one system" 
                  desc="Research and chat in Linear. Visualize and connect in Canvas. Drag insights between them seamlessly." 
                />
                <BenefitPoint 
                  icon={<Sparkles size={16} />}
                  title="Multi-model flexibility" 
                  desc="Switch models without worry." 
                />
              </div>

              {/* CTA */}
              <div className="mt-10 pt-8 border-t border-white/10">
                <a href="/login">
                  <button className="w-full group relative flex items-center justify-center gap-2 bg-white text-black font-bold py-4 px-6 rounded-xl hover:bg-gray-100 transition-all duration-200">
                    <span>Start free</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </a>
                {/* <p className="text-center text-xs text-gray-500 mt-3">
                  $19/month after trial • Bring your own API keys
                </p> */}
              </div>

              <div className="absolute top-[-50%] left-[-20%] w-[300px] h-[300px] bg-orange-500/10 blur-[80px] rounded-full pointer-events-none" />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// Helper Components
function PainPoint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex gap-4 opacity-60">
      <div className="flex-shrink-0 mt-1">
        <div className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
          <X size={12} strokeWidth={3} />
        </div>
      </div>
      <div>
        <h4 className="text-gray-300 font-semibold text-base line-through decoration-gray-600 decoration-1">
          {title}
        </h4>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">
          {desc}
        </p>
      </div>
    </div>
  );
}

function BenefitPoint({ title, desc, icon }: { title: string; desc: string; icon: any }) {
  return (
    <div className="flex gap-4 p-3 -mx-3 rounded-xl hover:bg-white/5 transition-colors duration-300">
      <div className="flex-shrink-0 mt-1">
        <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-black shadow-lg shadow-orange-500/20">
          <Check size={12} strokeWidth={4} />
        </div>
      </div>
      <div>
        <h4 className="text-white font-bold text-base flex items-center gap-2">
          {title}
          <span className="text-orange-400/50 hidden md:inline-block">
             {icon}
          </span>
        </h4>
        <p className="text-gray-400 text-sm mt-1 leading-relaxed">
          {desc}
        </p>
      </div>
    </div>
  );
}