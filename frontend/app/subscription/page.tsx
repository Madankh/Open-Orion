"use client";

import React, { useState, useEffect } from 'react';
import { Check, Zap, Users, Sparkles, Gift, Crown, ArrowRight, Server, Shield, Infinity, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import { toast } from "sonner";
import Navbar from '@/components/Navbar';
import { Paddle } from '@paddle/paddle-js';
import { nodeUrl } from "../../apiurl"
// --- TYPES ---
export interface UserState {
  accessToken: string;
  currentUser: {
    id: string;
    email: string;
    subscriptionEnd?: string;
  };
}

export interface RootState {
  user: UserState;
}

type UserData = {
  id: string;
  email: string;
  subscriptionEnd?: string;
  status?: string;
};

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  tokens: string;
  popular: boolean;
  priceId: string;
  features: string[];
  accent: string;
  buttonVariant: 'outline' | 'primary' | 'glow';
  isFree?: boolean;
};

const PricingPage = () => {
  const [paddle, setPaddle] = useState<Paddle>();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const userid = user?.currentUser?.id;

  // --- INITIALIZATION ---
  useEffect(() => {
    const initPaddle = async () => {
      try {
        const clientToken = 'live_c1f999995b448f44405cacc8c07';
        if (!clientToken) return;
        
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddleInstance = await initializePaddle({
          environment: "production",
          token: clientToken,
        });
        setPaddle(paddleInstance);
      } catch (error) {
        console.error("Failed to initialize Paddle:", error);
      }
    };
    initPaddle();
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!accessToken || !userid) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await fetch(`${nodeUrl}/api/auth/user/${userid}`, {
          method: 'GET',
          headers: {
            'token': `${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setUserData(data);
        setIsActive(data.status || null);
        setSubscriptionEnd(data.subscriptionEnd || null);
      } catch (err) {
        console.error("Error fetching user data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [accessToken, userid]);

  // --- HANDLERS ---
  const handleFreePlan = async () => {
    if (!accessToken || !userid) {
      toast.error("Please login to activate free plan");
      return;
    }
    try {
      const response = await fetch(`${nodeUrl}/api/auth/activate-free`, {
        method: 'POST',
        headers: {
          'token': `${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userid })
      });
      if (!response.ok) throw new Error('Failed to activate free plan');
      toast.success("Free plan activated successfully!");
      window.location.reload();
    } catch (error) {
      toast.error("Failed to activate free plan");
    }
  };

  const handleCheckout = (planId: string) => {
    if (!paddle) {
      toast.error("Payment system loading...");
      return;
    }
    if (!userData) {
      toast.error("Please login to continue");
      return;
    }
    const selectedPlan = plans.find(plan => plan.id === planId);
    if (!selectedPlan) return toast.error("Plan not found");

    try {
      paddle.Checkout.open({
        items: [{ priceId: selectedPlan.priceId, quantity: 1 }],
        customer: { email: userData.email },
        customData: { userid: userid, email: userData.email },
        settings: {
          displayMode: "overlay",
          theme: "dark",
          successUrl: "http://localhost:5000/success",
        },
      });
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to open checkout");
    }
  };

  const shouldRedirectToPortal = (planId: string) => {
    return isActive === 'active' && 
           subscriptionEnd && 
           planId !== 'onetime' &&
           planId !== 'free';
  };

  const handleCustomerPortal = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`${nodeUrl}/api/auth/generate-portal`, {
        method: 'GET',
        headers: { 'token': `${accessToken}`, 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error("Failed to access customer portal");
    }
  };

  // --- CONFIGURATION ---
  const plans: Plan[] = [
    {
      id: 'free',
      name: 'Explorer',
      price: '$0',
      period: '/forever',
      description: 'Experience the power of CuriosityLab.',
      tokens: '60 credits',
      popular: false,
      priceId: '',
      accent: 'text-slate-400',
      buttonVariant: 'outline',
      isFree: true,
      features: ['Basic AI Agents', '60 Credits (One-time)', 'Community Support', 'Standard Interface']
    },
    {
      id: 'Starter',
      name: 'starter',
      price: '$8',
      period: '/month',
      description: 'Essential tools with managed limits.',
      tokens: '3,500 tokens',
      popular: false,
      priceId: 'pri_01k4cqb86ptfc3fm83e46at076',
      accent: 'text-blue-400',
      buttonVariant: 'primary',
      features: ['Everything in Curiosity', '3,500 Tokens / mo', 'Faster Updates', 'Reasoning Models',"All features included"]
    },
    {
      id: 'custom',
      name: 'BYOK',
      price: '$7',
      period: '/month',
      description: 'Unlock the full power. No limits.',
      tokens: 'Unlimited (BYOK)',
      popular: true,
      priceId: 'pri_01k1tzxa0d6ep79f80x6rab127',
      accent: 'text-amber-400',
      buttonVariant: 'glow',
      features: ['UNLIMITED AI messages','Unlimited workspaces', 'Different models', 'Zero Token Limits (Pay direct)', 'Full Canvas & linear workspace', 'You control your API spending']
    },
    {
      id: 'basic',
      name: 'Managed Pro',
      price: '$20',
      period: '/month',
      description: 'We handle the infrastructure.',
      tokens: '8,000 tokens',
      popular: false,
      priceId: 'pri_01k1tzpsngg82h1j0fc9rj92rb',
      accent: 'text-purple-400',
      buttonVariant: 'primary',
      features: ['Everything in Curiosity', '8,000 Tokens / mo', 'No API Key Needed', 'Advanced Reasoning','Full Canvas & linear workspace', "All features included"]
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white selection:bg-amber-500/30 font-sans">
      <Navbar url='http://localhost:5000'/>
      
      {/* --- BACKGROUND FX --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-indigo-900/20 rounded-[100%] blur-[120px] mix-blend-screen" />
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-600/10 rounded-[100%] blur-[100px] mix-blend-screen" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-24">
        
        {/* --- HEADER --- */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-900/10 mb-6 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-xs font-semibold text-amber-200 tracking-wide uppercase">New: OpenRouter Integration</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
            Scale your <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200">Curiosity</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Stop paying for unused tokens. Bring your own keys for unlimited intelligence, 
            or let us manage the infrastructure for you.
          </p>
        </div>

        {/* --- PRICING GRID --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
          {plans.map((plan) => {
            const isHighlight = plan.id === 'custom';
            
            return (
              <div
                key={plan.id}
                className={`
                  relative flex flex-col h-full rounded-3xl p-6 transition-all duration-300
                  ${isHighlight 
                    ? 'bg-zinc-900/80 border border-amber-500/50 shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)] z-10 lg:-mt-12 lg:mb-12 scale-[1.02]' 
                    : 'bg-zinc-950/50 border border-white/5 hover:border-white/10 hover:bg-zinc-900/50'
                  }
                  backdrop-blur-xl
                `}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-0 right-0 flex justify-center">
                    <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1">
                      <Crown size={12} /> Best Value
                    </div>
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h3 className={`font-semibold mb-2 ${isHighlight ? 'text-white text-xl' : 'text-slate-200 text-lg'}`}>
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className={`font-bold tracking-tight ${isHighlight ? 'text-4xl text-white' : 'text-3xl text-slate-200'}`}>
                      {plan.price}
                    </span>
                    <span className="text-sm text-slate-500">{plan.period}</span>
                  </div>
                  <p className="text-sm text-slate-500 min-h-[40px] leading-snug">
                    {plan.description}
                  </p>
                </div>

                {/* Tokens Capsule */}
                <div className={`
                  flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg mb-6 w-fit
                  ${isHighlight ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-white/5 text-slate-400 border border-white/5'}
                `}>
                  {isHighlight ? <Zap size={14} className="fill-amber-500/50" /> : <Sparkles size={14} />}
                  {plan.tokens}
                </div>

                {/* Divider */}
                <div className="h-px bg-white/5 w-full mb-6" />

                {/* Features */}
                <ul className="space-y-4 mb-8 flex-grow">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className={`mt-0.5 rounded-full p-0.5 ${isHighlight ? 'bg-amber-500 text-black' : 'bg-white/10 text-slate-300'}`}>
                        <Check size={10} strokeWidth={4} />
                      </div>
                      <span className={isHighlight ? 'text-slate-200' : 'text-slate-400'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <button
                  onClick={() => {
                    if (plan.isFree) handleFreePlan();
                    else if (shouldRedirectToPortal(plan.id)) handleCustomerPortal();
                    else handleCheckout(plan.id);
                  }}
                  disabled={loading}
                  className={`
                    w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2
                    ${plan.buttonVariant === 'glow' 
                      ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]' 
                      : ''}
                    ${plan.buttonVariant === 'primary' 
                      ? 'bg-white text-black hover:bg-slate-200' 
                      : ''}
                    ${plan.buttonVariant === 'outline' 
                      ? 'bg-transparent border border-white/20 text-white hover:bg-white/5' 
                      : ''}
                  `}
                >
                  {plan.isFree ? 'Start Exploring' : 
                   shouldRedirectToPortal(plan.id) ? 'Manage Plan' : 
                   isHighlight ? 'Unlock Infinite Hub' : 'Get Started'}
                  {!shouldRedirectToPortal(plan.id) && <ArrowRight size={16} />}
                </button>
                
                {isHighlight && (
                  <p className="text-[10px] text-center text-amber-500/60 mt-3 font-medium">
                    *Requires OpenRouter API key
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* --- COMPARISON SECTION --- */}
        <div className="mt-32 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center bg-zinc-900/30 border border-white/10 rounded-3xl p-8 md:p-12 overflow-hidden relative">
            
            {/* Ambient Background for Section */}
            <div className="absolute -right-20 -top-20 w-96 h-96 bg-amber-500/10 rounded-full blur-[80px]" />

            <div className="relative z-10">
              <h2 className="text-3xl font-bold text-white mb-4">Why we built "BYOK"</h2>
              <p className="text-slate-400 mb-6 text-lg leading-relaxed">
                Traditional AI subscriptions lock you into one model and strictly limit your usage. We flipped the script. 
                By separating the <strong>interface</strong> from the <strong>intelligence</strong>, you get:
              </p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-slate-200">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-400"><Infinity size={16} /></div>
                  <span>Pay exactly for what you use (No $20/mo waste)</span>
                </div>
                <div className="flex items-center gap-3 text-slate-200">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400"><Server size={16} /></div>
                  <span>Switch between models instantly</span>
                </div>
                <div className="flex items-center gap-3 text-slate-200">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400"><Shield size={16} /></div>
                  <span>Your keys, your privacy, your data</span>
                </div>
              </div>
              <div className="mt-8">
                 <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-sm font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                    Get an OpenRouter Key <ArrowRight size={14} />
                 </a>
              </div>
            </div>

            {/* Visual Comparison Card */}
            <div className="relative z-10 bg-black/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
               <div className="grid grid-cols-3 gap-4 border-b border-white/10 pb-4 mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                 <div>Feature</div>
                 <div className="text-center">Others</div>
                 <div className="text-center text-amber-400">CuriosityLab</div>
               </div>
               
               {[
                 { label: "AI Models", bad: "1 Fixed", good: "Diffrent Models" },
                 { label: "Token Limit", bad: "Hard Cap", good: "Unlimited" },
                 { label: "Cost Basis", bad: "$20+/mo", good: "$7 + Usage" },
                 { label: "Privacy", bad: "Opaque", good: "Transparent" },
               ].map((item, i) => (
                 <div key={i} className="grid grid-cols-3 gap-4 py-3 border-b border-white/5 last:border-0 text-sm">
                    <div className="text-slate-300 font-medium">{item.label}</div>
                    <div className="text-center text-red-400/80 flex justify-center items-center gap-1"><X size={12}/> {item.bad}</div>
                    <div className="text-center text-green-400 flex justify-center items-center gap-1"><Check size={12}/> {item.good}</div>
                 </div>
               ))}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default PricingPage;