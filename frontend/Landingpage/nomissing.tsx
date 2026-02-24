"use client";
import React, { useState, useEffect } from 'react';

const AnimatedHero = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const words = [
    { text: "tool hopping", type: "gradient" },
    { text: "prompt juggling", type: "normal" },
    { text: "lost context", type: "gradient" }, 
    { text: "wasted time", type: "gradient" },
    { text: "no collab", type: "normal" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, 2000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="min-h-[400px] w-full bg-[#f4f2f0] flex flex-col items-center justify-center font-sans">
      
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
        
        {/* Left Static Text */}
        <div className="relative">
          <h2 className="text-4xl md:text-6xl font-bold text-gray-900 tracking-tight z-10 relative">
            No worry about
          </h2>
          
          {/* Decorative Arrow (SVG) */}
          <div className="absolute -top-8 -right-12 hidden md:block">
             <svg width="60" height="40" viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform rotate-12">
               <path d="M10 50 C 30 10, 70 10, 90 40" stroke="url(#arrow-gradient)" strokeWidth="3" fill="none" strokeLinecap="round" />
               <path d="M80 35 L 90 40 L 85 50" stroke="url(#arrow-gradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
               <defs>
                 <linearGradient id="arrow-gradient" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
                   <stop stopColor="#f97316" /> {/* Orange */}
                   <stop offset="1" stopColor="#a855f7" /> {/* Purple */}
                 </linearGradient>
               </defs>
             </svg>
          </div>
        </div>

        {/* Right Animated Text Container */}
        <div className="h-[80px] overflow-hidden flex flex-col items-start justify-center relative w-[350px]">
          {words.map((item, index) => {
            
            // Calculate position for the "slot machine" scroll effect
            // We want the active item in the center, previous item above, next item below
            let positionClass = "translate-y-[100%] opacity-0"; // Default: below and invisible
            
            if (index === currentIndex) {
              positionClass = "translate-y-0 opacity-100"; // Active: Center, visible
            } else if (index === (currentIndex - 1 + words.length) % words.length) {
              positionClass = "-translate-y-[100%] opacity-0"; // Previous: Up and invisible
            }

            return (
              <div 
                key={index}
                className={`absolute top-0 left-0 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] w-full ${positionClass}`}
              >
                {item.type === 'gradient' ? (
                  <span className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 bg-clip-text text-transparent pb-2 block">
                    {item.text}
                  </span>
                ) : (
                  <span className="text-4xl md:text-6xl font-bold text-gray-300 block">
                    {item.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </section>
  );
};

export default AnimatedHero;