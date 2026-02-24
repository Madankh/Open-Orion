"use client"
import React, { useState, useEffect } from 'react';
import { CheckCircle, Home, User, ArrowRight, Sparkles, Crown, Star, Loader2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import { nodeUrl } from "../../apiurl"
interface ConfettiParticle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
}

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

const PaymentSuccessPage: React.FC = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [subscriptionEnd, setsubscriptionEnd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const userid = user?.currentUser?.id;
  const [loading, setLoading] = useState(true);
    useEffect(() => {
      const fetchUserData = async () => {
        if (!accessToken || !userid) {
          setError("User authentication required");
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
  
          if (!response.ok) {
            throw new Error(`Failed to fetch user: ${response.status}`);
          }
  
          const data = await response.json();
          setsubscriptionEnd(data.subscriptionEnd);
          setError(null);
          console.log("User data loaded:", data);
        } catch (err) {
          console.error("Error fetching user data:", err);
          setError("Failed to load user data");
        } finally {
          setLoading(false);
        }
      };
  
      fetchUserData();
    }, [accessToken, userid]); 


  // Simulate getting tokens from localStorage or props
  useEffect(() => {
    // Trigger animations
    setIsVisible(true);
    
    // Generate confetti particles
    const particles: ConfettiParticle[] = [];
    for (let i = 0; i < 50; i++) {
      particles.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 2,
        size: 3 + Math.random() * 5,
        rotation: Math.random() * 360
      });
    }
    setConfetti(particles);
  }, []);

  const handleCustomerPortal = async (): Promise<void> => {
    if (!accessToken || !subscriptionEnd) {
      alert("Authentication or customer ID missing");
      return;
    }

    try {
      const response = await fetch(`${nodeUrl}/api/auth/generate-portal`, {
        method: 'GET',
        headers: {
          'token': `${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to generate portal: ${response.status}`);
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (err) {
      console.error("Error generating customer portal session:", err);
      alert("Failed to access customer portal");
    }
  };

  const handleGoHome = (): void => {
    window.location.href = '/';
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#000000]">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#000000]">
        <div className="text-red-500 text-center">
          <p className="text-xl mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0">
        {/* Geometric patterns */}
        <div className="absolute top-0 left-0 w-full h-full opacity-5">
          <div className="absolute top-20 left-20 w-96 h-96 border border-white rounded-full animate-spin" style={{ animationDuration: '20s' }}></div>
          <div className="absolute top-40 right-40 w-72 h-72 border border-white rounded-full animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }}></div>
          <div className="absolute bottom-20 left-1/3 w-64 h-64 border border-white rounded-full animate-spin" style={{ animationDuration: '25s' }}></div>
        </div>
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-gray-900/10 to-transparent"></div>
        
        {/* Floating particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full opacity-30 animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Elegant Confetti Animation */}
      <div className="absolute inset-0 pointer-events-none">
        {confetti.map((particle) => (
          <div
            key={particle.id}
            className="absolute bg-white animate-bounce opacity-80"
            style={{
              left: `${particle.left}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              top: '-20px',
              transform: `translateY(100vh) rotate(${particle.rotation}deg)`,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              clipPath: Math.random() > 0.7 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none'
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
        <div className={`max-w-2xl w-full text-center transform transition-all duration-1000 ease-out ${
          isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95'
        }`}>
          
          {/* Success Icon with Premium Styling */}
          <div className="relative mx-auto w-40 h-40 mb-12">
            {/* Outer ring */}
            <div className="absolute inset-0 border-2 border-white/20 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
            <div className="absolute inset-2 border border-white/30 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}></div>
            
            {/* Main circle */}
            <div className="absolute inset-4 bg-white rounded-full shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-500">
              <CheckCircle className="w-20 h-20 text-black animate-pulse" />
            </div>
            
            {/* Decorative elements */}
            <Star className="absolute -top-4 -right-4 w-8 h-8 text-white animate-pulse" style={{ animationDelay: '0.5s' }} />
            <Crown className="absolute -top-6 -left-4 w-10 h-10 text-white animate-bounce" style={{ animationDelay: '1s' }} />
            <Sparkles className="absolute -bottom-2 -right-6 w-6 h-6 text-white animate-spin" style={{ animationDuration: '4s' }} />
            <Star className="absolute -bottom-4 -left-6 w-5 h-5 text-white animate-pulse" style={{ animationDelay: '1.5s' }} />
          </div>

          {/* Success Message */}
          <div className="mb-16 space-y-8">
            <div className={`transform transition-all duration-1000 delay-300 ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}>
              <h1 className="text-6xl md:text-7xl font-light text-white mb-6 tracking-tight">
                Success
              </h1>
              <div className="w-24 h-0.5 bg-white mx-auto mb-8"></div>
            </div>
            
            <div className={`bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl transform transition-all duration-1000 delay-500 ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}>
              <p className="text-2xl text-white/90 mb-4 font-light">Payment Completed</p>
              <p className="text-lg text-white/70 leading-relaxed">
                Your transaction has been processed successfully.<br />
                Welcome to our premium experience.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`space-y-6 mb-12 transform transition-all duration-1000 delay-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}>
            {/* Customer Portal Button */}
            <button
              onClick={handleCustomerPortal}
              className="group w-full bg-white hover:bg-gray-100 text-black font-medium py-6 px-12 rounded-2xl shadow-2xl transform hover:scale-[1.02] transition-all duration-300 flex items-center justify-center space-x-4 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-gray-50 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <User className="w-6 h-6 relative z-10" />
              <span className="relative z-10 text-lg">Manage Subscription</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-300 relative z-10" />
            </button>

            {/* Home Button */}
            <button
              onClick={handleGoHome}
              className="group w-full bg-transparent hover:bg-white/5 text-white border-2 border-white/20 hover:border-white/40 font-medium py-6 px-12 rounded-2xl shadow-2xl transform hover:scale-[1.02] transition-all duration-300 flex items-center justify-center space-x-4 relative overflow-hidden backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <Home className="w-6 h-6 relative z-10" />
              <span className="relative z-10 text-lg">Return Home</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-300 relative z-10" />
            </button>
          </div>

          {/* Additional Info */}
          <div className={`bg-white/3 backdrop-blur-xl rounded-2xl p-6 border border-white/5 transform transition-all duration-1000 delay-900 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}>
            <div className="space-y-3">
              <p className="text-white/70 flex items-center justify-center space-x-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                <span>Confirmation email sent to your inbox</span>
              </p>
              <p className="text-white/50 text-sm">
                Questions? Our support team is available 24/7
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Elegant Corner Decorations */}
      <div className="absolute top-8 left-8">
        <div className="w-16 h-16 border-l-2 border-t-2 border-white/20"></div>
      </div>
      <div className="absolute top-8 right-8">
        <div className="w-16 h-16 border-r-2 border-t-2 border-white/20"></div>
      </div>
      <div className="absolute bottom-8 left-8">
        <div className="w-16 h-16 border-l-2 border-b-2 border-white/20"></div>
      </div>
      <div className="absolute bottom-8 right-8">
        <div className="w-16 h-16 border-r-2 border-b-2 border-white/20"></div>
      </div>

      {/* Subtle Animated Elements */}
      <div className="absolute top-1/4 left-16 animate-bounce opacity-60" style={{ animationDelay: '1s', animationDuration: '3s' }}>
        <div className="w-3 h-3 bg-white rounded-full shadow-lg"></div>
      </div>
      <div className="absolute top-1/3 right-20 animate-bounce opacity-40" style={{ animationDelay: '2s', animationDuration: '4s' }}>
        <div className="w-2 h-2 bg-white rounded-full shadow-lg"></div>
      </div>
      <div className="absolute bottom-1/3 left-1/4 animate-bounce opacity-50" style={{ animationDelay: '1.5s', animationDuration: '3.5s' }}>
        <div className="w-4 h-4 bg-white rounded-full shadow-lg"></div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        @media (max-width: 768px) {
          h1 {
            font-size: 3rem;
          }
        }
        
        @media (max-width: 640px) {
          .w-40 {
            width: 8rem;
          }
          .h-40 {
            height: 8rem;
          }
          h1 {
            font-size: 2.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PaymentSuccessPage;