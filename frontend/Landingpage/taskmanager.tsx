"use client" 
import React from 'react';
import { 
  GitFork, 
  Sparkles, 
  Users, 
  Bell, 
} from 'lucide-react';
import Mainimg from "@/Image/whiteboard.png";
import Image from 'next/image';

// --- Data for the Feature Grid ---
const features = [
  {
    icon: <GitFork className="w-6 h-6 text-gray-300" />, 
    title: "Context Canvas",
    description: "Bring fragmented inputs together - research, designs, feedback, videos, docs - on a single canvas."
  },
  {
    icon: <Sparkles className="w-6 h-6 text-gray-300" />, 
    title: "Actionable AI Agents",
    description: "AI that understands your workspace. Agents reason over everything on the canvas instead of isolated prompts."
  },
  {
    icon: <Users className="w-6 h-6 text-gray-300" />, 
    title: "Collaborative Thinking",
    description: "Work together without losing context. Comment, iterate, and refine ideas with your team. The canvas stays shared and alive."
  },
  {
    icon: <Bell className="w-6 h-6 text-gray-300" />, 
    title: "Living Memory",
    description: "No more re-explaining things. Your canvas remembers decisions, changes, and rationale as your project evolves."
  }
];

// --- Sub-Component: Individual Feature Item ---
const FeatureItem = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex flex-col items-start gap-3">
    <div className="p-0 mb-2">
      {/* Icon color handled in data object, but wrapper allows sizing */}
      {icon}
    </div>
    {/* CHANGE: text-gray-900 (black) -> text-gray-100 (white) */}
    <h3 className="text-xl font-bold text-gray-100">
      {title}
    </h3>
    {/* CHANGE: text-gray-600 (dark gray) -> text-gray-400 (light gray) */}
    <p className="text-gray-400 leading-relaxed text-base">
      {description}
    </p>
  </div>
);

const MockupUI = () => (
  <div className="relative group">
    {/* Background Glow Effect */}
    <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-3xl opacity-30 group-hover:opacity-50 transition duration-1000"></div>
    
    {/* CHANGE: bg-white -> bg-white/5 (Glass effect), border-gray-200 -> border-white/10 */}
    <div className="relative bg-white/5 rounded-2xl p-2 shadow-2xl border border-white/10 backdrop-blur-sm">
      
      {/* Browser-like top bar */}
      <div className="flex gap-1.5 mb-2 px-2 opacity-60">
        <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
        <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
      </div>

      {/* The Image Wrapper */}
      {/* CHANGE: border-gray-100 -> border-white/5 */}
      <div className="relative overflow-hidden rounded-xl border border-white/5 shadow-inner bg-gray-900">
        <Image
          src={Mainimg}
          alt="Curiositylab Interface"
          width={1200} 
          height={800}
          className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-700 opacity-90 hover:opacity-100"
          unoptimized
        />
      </div>
    </div>
  </div>
);

export default function TaskManagementSection() {
  return (
    <section className="bg-[#0a0404] w-full py-20 px-4 md:px-8 lg:px-16 overflow-hidden relative">
      
      {/* Optional: Add slight noise texture to match Hero if desired */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
        
        {/* Left Column: Text Content */}
        <div className="flex flex-col justify-center">

          <div className="mb-6">
            {/* CHANGE: bg-white -> bg-white/10, text-gray-400 -> text-gray-300 */}
            <span className="bg-white/10 border border-white/10 backdrop-blur-md text-gray-300 text-sm font-semibold px-4 py-1.5 rounded-full shadow-sm">
              Task Management
            </span>
          </div>

          {/* CHANGE: text-gray-400 -> text-white (Make headline pop more) */}
          <h2 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1] mb-16">
            All Your Data,<br />
            <span className="text-gray-500">Inside Structured Flow</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-12">
            {features.map((feature, index) => (
              <FeatureItem 
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>

        </div>

        {/* Right Column: Image */}
        <div className="relative mt-8 lg:mt-0 w-full">
          <MockupUI />
        </div>

      </div>
    </section>
  );
}