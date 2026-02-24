import React from 'react';
import { Check } from 'lucide-react';
import Mainimg from "@/Image/ppo.png"; // Keeping your import
import Image from 'next/image';

const FeatureListItem = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3 group">
    {/* Animated Icon Background - Amber/Orange Theme */}
    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/10 flex items-center justify-center mt-0.5 border border-orange-500/20 group-hover:bg-orange-500/20 transition-colors duration-300">
      <Check className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-300 transition-colors" strokeWidth={3} />
    </div>
    {/* Text with hover effect */}
    <span className="text-gray-400 text-lg leading-snug group-hover:text-gray-200 transition-colors duration-300">
      {text}
    </span>
  </div>
);

const CanvasMockup = () => (
  <div className="relative w-full group">
    {/* Ambient Glow - Warm tones to match the section background */}
    <div className="absolute -inset-1 bg-gradient-to-r from-orange-600/20 to-amber-600/20 rounded-2xl blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"></div>

    {/* Main Container - PADDING REMOVED so image hits the edges */}
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
        <div className="flex-1 max-w-md mx-auto bg-white/5 border border-white/5 rounded-md px-3 py-1 flex items-center justify-center sm:justify-start text-xs text-gray-500 font-mono transition-colors hover:bg-white/10 hover:text-gray-400">
          <span className="truncate">curiositylab.fun/whiteboard</span>
        </div>
      </div>

      {/* The Image - Full Width, No Padding */}
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
        
        {/* Vignette Overlay to blend image edges into border */}
        <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)] pointer-events-none"></div>
      </div>
    </div>
  </div>
);

export default function FeaturesSection() {
  return (
    <section className="bg-[#050505] py-24 px-6 md:px-12 w-full flex items-center justify-center relative overflow-hidden">
      
      {/* Background Effects */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Warm radial gradient matching your original code */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(180,80,30,0.15),transparent_70%)] blur-[80px] opacity-60"></div>
        
        {/* Noise Texture */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center relative z-10">
        
        {/* Canvas/Image Section */}
        <div className="w-full order-1">
          <CanvasMockup />
        </div>
          
        {/* Text Content Section */}
        <div className="flex flex-col items-start space-y-8 order-2">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-1.5 rounded-full shadow-sm backdrop-blur-md cursor-default hover:bg-white/10 transition-colors">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="text-sm font-medium text-gray-200">Linear workflow</span>
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.15]">
              Work Smarter with <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-600">
                Context, not Complexity
              </span>
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed max-w-lg">
              Curiositylab turns thinking, artifacts, and decisions into a shared space where humans and AI reason together without friction.
            </p>
          </div>

          <div className="space-y-5 pt-2">
             <FeatureListItem text="AI agents to autonomously research the web, PDFs, and files." />
             <FeatureListItem text="Agents handle multi-step research: search, read, and synthesize." />
             <FeatureListItem text="Build 'living' documents: Embed whiteboards and YouTube videos next to your notes." />
             <FeatureListItem text="Turn raw AI insights into structured text with tables, headers, and lists." />
             <FeatureListItem text="Your entire Knowledge Space acts as the AI's long-term memory." />
             <FeatureListItem text="Drag any element—notes, videos, or diagrams to the canvas to map connections." />
           </div>
        </div>
      </div>
    </section>
  );
}