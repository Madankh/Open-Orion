"use client";

import React, { useState } from 'react';
import { 
  Menu, 
  X
} from 'lucide-react';
import Mainimg from "@/Image/Main.png";
import Image from 'next/image';

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto w-full relative z-50">
      <div className="flex items-center gap-2 font-semibold text-xl text-gray-300">
        <span>Curiositylab</span>
      </div>

      {/* Center Links (Hidden on mobile) */}
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
        <a href="canvas" className="hover:text-white transition-colors">Home</a>
        <a href="#features" className="hover:text-white transition-colors">Features</a>
        <a href="subscription" className="hover:text-white transition-colors">Pricing</a>
        <a href="#comparison" className="hover:text-white transition-colors">Comparison</a>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        <a href="/login">
          <button className="px-5 py-2 text-sm font-medium text-white bg-white/10 border border-white/10 rounded-lg hover:bg-white/20 transition-colors backdrop-blur-sm">
            Try free
          </button>
        </a>
        
        {/* Mobile Menu Toggle Button */}
        <button 
          className="md:hidden text-gray-300 hover:text-white transition-colors p-1"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-[#0a0a0a] border-b border-white/10 shadow-2xl md:hidden flex flex-col items-center py-8 space-y-6 z-50">
          <a href="canvas" className="text-gray-300 hover:text-white font-medium text-lg">Home</a>
          <a href="#features" className="text-gray-300 hover:text-white font-medium text-lg">Features</a>
          <a href="subscription" className="text-gray-300 hover:text-white font-medium text-lg">Pricing</a>
          <a href="#comparison" className="text-gray-300 hover:text-white font-medium text-lg">Comparison</a>
          <a href="/services" className="text-gray-300 hover:text-white font-medium text-lg">Services</a>
          <a href="/login" className="w-full px-6">
            <button className="w-full py-3 text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
              Try free
            </button>
          </a>
        </div>
      )}
    </nav>
  );
};

const DashboardMockup = () => (
  <div className="w-full max-w-6xl mx-auto mt-16 relative z-10 px-4 pb-20">
    <div className="absolute -inset-10 bg-gradient-to-tr from-purple-500/10 via-orange-500/10 to-transparent blur-[120px] -z-10"></div>
    {/* The Image Container */}
    <div className="relative rounded-2xl p-1.5 bg-white/5 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-sm">
      <div className="overflow-hidden rounded-xl border border-gray-200/20">
        <Image
          src={Mainimg}
          alt="Curiositylab Dashboard"
          width={1200}
          height={800}
          layout="responsive"
          className="w-full h-auto object-cover"
          unoptimized
          priority
        />
      </div>
    </div>
  </div>
);

export default function HeroSection() {
  return (
    <div className="relative w-full min-h-screen bg-[#000000] overflow-hidden flex flex-col font-sans">
      
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-100px] left-[-200px] w-[600px] h-[600px] bg-purple-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-30 animate-pulse"></div>
        <div className="absolute top-[-100px] right-[-200px] w-[600px] h-[600px] bg-orange-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-40"></div>
        <div className="absolute top-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
      </div>

      <Navbar />

      <main className="flex-1 flex flex-col items-center pt-16 md:pt-24 px-4 relative z-10">


<div className="flex flex-col items-center mb-10 max-w-5xl mx-auto px-4">
  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-purple-300 text-sm font-medium mb-6 backdrop-blur-md">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
    </span>
    Agentic workspace 
  </div>
  
  <h1 className="text-6xl md:text-8xl font-bold text-center text-white tracking-tighter leading-none text-balance drop-shadow-2xl">
    Infinite thinking. <br className="md:hidden" />
    <span className="text-transparent bg-clip-text bg-gradient-to-br from-gray-200 to-gray-600">
      Autonomous execution.
    </span>
  </h1>
</div>
        {/* Subtext */}
        <p className="text-lg md:text-xl text-center text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Research, connect, execute, and collaborate in one intelligent workspace. Agents keep ideas linked across chat, canvas, and execution.
        </p>

        <a href="/login">
          <button className="bg-white text-black px-8 py-3.5 rounded-lg text-base font-semibold hover:bg-gray-200 transition-all shadow-lg hover:shadow-white/20 hover:-translate-y-0.5">
            Get started
          </button>
        </a>
        
        {/* Dashboard Mockup */}
        <DashboardMockup />

      </main>
    </div>
  );
}