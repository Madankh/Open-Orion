import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
import Mainimg from "@/Image/part1.png"; // Ensure this path is correct
import Image from 'next/image';

const FeatureListItem = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3 group">
    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center mt-0.5 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
      <Check className="w-3.5 h-3.5 text-indigo-400" strokeWidth={3} />
    </div>
    <span className="text-gray-300 text-lg leading-snug group-hover:text-white transition-colors">{text}</span>
  </div>
);

const UseCaseCard = ({ title, desc, colorClass }: { title: string, desc: string, colorClass: string }) => (
  <div className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 hover:border-white/10 transition-all duration-300 cursor-default group">
    <p className={`text-sm font-semibold mb-2 ${colorClass}`}>{title}</p>
    <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300">
      {desc}
    </p>
  </div>
);

const CanvasMockup = () => (
  <div className="relative w-full group">
    {/* Ambient Background Glow - Adds depth */}
    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur-2xl opacity-50 group-hover:opacity-75 transition-opacity duration-500"></div>

    {/* Main Container - Removed padding (p-6) to let image fill space */}
    <div className="relative bg-[#0A0A0A] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      
      {/* Background Grid with Fade Mask */}
      <div className="absolute inset-0 z-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)]"></div>
      
      {/* Browser Chrome / Header */}
      <div className="relative z-10 bg-black/40 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center gap-4">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56] shadow-sm"></div>
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E] shadow-sm"></div>
          <div className="w-3 h-3 rounded-full bg-[#27C93F] shadow-sm"></div>
        </div>
        
        {/* URL Bar */}
        <div className="flex-1 max-w-md mx-auto bg-white/5 border border-white/5 rounded-md px-3 py-1 flex items-center justify-center sm:justify-between text-xs text-gray-500 font-mono transition-colors hover:bg-white/10 hover:text-gray-400">
          <span className="truncate">curiositylab.fun/canvas</span>
        </div>
        
        {/* Placeholder for right actions */}
        <div className="w-12 hidden sm:block"></div> 
      </div>

      {/* The Image - Now full width of the container */}
      <div className="relative z-10 w-full h-auto bg-[#050505] overflow-hidden">
        <Image
          src={Mainimg}
          alt="Curiositylab Interface"
          width={1600}
          height={1000}
          className="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity duration-500"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
          unoptimized
        />
        
        <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] pointer-events-none"></div>
      </div>
    </div>
  </div>
);

export default function FeaturesSectionRight() {
  return (
    <section className="bg-[#000000] py-24 px-6 md:px-12 w-full flex items-center justify-center relative overflow-hidden">
        
      {/* Grain & Noise Texture */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

      {/* Decorative background blobs */}
      <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[128px] pointer-events-none"></div>

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start relative z-10">
        
        {/* Left Content */}
        <div className="flex flex-col items-start space-y-8 order-2 lg:order-1 pt-4">
          
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-1.5 rounded-full shadow-sm backdrop-blur-md hover:bg-white/10 transition-colors cursor-default">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            <span className="text-sm font-medium text-gray-200">Infinity Canvas</span>
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1]">
              See how ideas connect <br className="hidden md:block"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-600">
                instead of losing them.
              </span>
            </h2>
            <p className="text-gray-400 max-w-lg text-lg">
              Start organizing by meaning. Visualize the connections between your ideas, notes, PDFs, and insights.
            </p>
          </div>

          <div className="space-y-4 pt-2 w-full">
            <FeatureListItem text="Branch your ideas and explore them with AI across PDFs, videos, and documents." />
            <FeatureListItem text="Visually see relationships between sources" />
            <FeatureListItem text="Centralize all research created in your Linear workflow" />
            <FeatureListItem text="Drag insights to the canvas with real-time sync" />
            <FeatureListItem text="Context-aware AI chat with infinite branching" />
            <FeatureListItem text="Real-time team collaboration" />
          </div>

          {/* Improved Grid for Use Cases */}
          <div className="grid grid-cols-2 gap-3 pt-6 w-full">
            <UseCaseCard 
              title="Research" 
              desc="Connect findings across papers, spot patterns instantly." 
              colorClass="text-blue-400" 
            />
            <UseCaseCard 
              title="Writing" 
              desc="Outline ideas and branch subthemes visually." 
              colorClass="text-purple-400" 
            />
            <UseCaseCard 
              title="Learning" 
              desc="Build a personal knowledge graph of connected concepts." 
              colorClass="text-green-400" 
            />
            <UseCaseCard 
              title="Strategy" 
              desc="Map decisions and explore scenarios with AI assistance." 
              colorClass="text-orange-400" 
            />
          </div>

        </div>

        {/* Right Content (Image) */}
        <div className="w-full order-1 lg:order-2 lg:sticky lg:top-24">
          <CanvasMockup />
        </div>

      </div>
    </section>
  );
}