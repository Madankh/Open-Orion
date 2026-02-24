'use client';

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from "react-redux";
import { loginSuccess, loginFailure, logout } from '../components/redux/userRedux';
import Link from 'next/link';
import type { AppDispatch } from "../components/redux/store";
import { nodeUrl } from "../apiurl"

interface User {
  id: string;
  username: string;
  email: string;
  profile:string;
}

interface RootState {
  user: {
    currentUser: User | null;
    accessToken: string | null;
    isFetching: boolean;
    error: string | null;
  };
}


interface Props {
  url: string;
}

const Navbar: React.FC<Props> = ({ url }) => {
  const { currentUser } = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch<AppDispatch>();

  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const response = await fetch(`${nodeUrl}/api/auth/login/success`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          const user = data.user || data.userData || data;
          const token = data.accessToken || data.token || data.access_token || 'dummy-token';

          if (user && (user.id || user._id)) {
            const normalizedUser = {
              id: user.id || user._id,
              username: user.username || user.name || user.displayName || 'Unknown',
              email: user.email || 'unknown@email.com',
              profile:user.profile || ""
            };
            dispatch(loginSuccess({ user: normalizedUser, accessToken: token }));
          } else {
            dispatch(loginFailure("Invalid user data received"));
          }
        } else {
          const errorText = await response.text();
          console.log('❌ Response not OK:', errorText);
        }
      } catch (err) {
        console.error("💥 Login check error:", err);
        dispatch(loginFailure(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`));
      } finally {
        setHasCheckedAuth(true);
      }
    };

    checkLoginStatus();
  }, [dispatch, url]);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      setScrolled(isScrolled);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const response = await fetch(`${url}/api/auth/logout`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Logout failed");

      localStorage.clear();
      dispatch(logout());
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <nav className={`
        fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out
        ${scrolled 
          ? 'bg-slate-800/95 backdrop-blur-sm border-b border-slate-700/50' 
          : 'bg-slate-900/98 backdrop-blur-sm'}
      `}>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-700/50"></div>
        
        <div className="relative w-full px-4 lg:px-6">
          <div className="flex justify-between items-center h-14 lg:h-16">
            
            <Link href="/" className="group no-underline">
              <h1 style={{marginLeft:"40px", marginTop:"12px"}}>
                Curiositylab
              </h1>
            </Link>

            
            <div className="hidden lg:flex items-center space-x-8">
              {mounted && currentUser && (
                <div className="text-white/90 hover:text-white text-sm font-medium transition-colors duration-200 no-underline"> 
                  <Link href={`/profile?id=${currentUser.id}`} className="text-white/90 hover:text-white text-sm font-medium transition-colors duration-200 no-underline">
                    Account
                  </Link>
                </div>
              )}
              <Link href="/bug-report" className="text-white/90 hover:text-white text-sm font-medium transition-colors duration-200 no-underline">
                  Bug Report
               </Link>
              <Link href="/subscription" className="text-white/90 hover:text-white text-sm font-medium transition-colors duration-200 no-underline">
                Pricing
              </Link>
              
              <div className="hidden md:flex items-center space-x-8">
                <Link href="/canvas" className="text-white/90 hover:text-red-400 text-sm font-medium cursor-pointer transition-colors duration-20">Aether</Link>
              </div>
              
              {mounted && hasCheckedAuth && (currentUser ? (
                <div className="text-white/90 hover:text-red-400 text-sm font-medium cursor-pointer transition-colors duration-200" onClick={handleLogout}>
                  Logout
                </div>
              ) : (
                <Link href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 no-underline">
                  Login
                </Link>
              ))}
            </div>

            <button 
              className="lg:hidden w-10 h-10 flex items-center justify-center text-white hover:text-blue-400 transition-colors duration-200" 
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <div className="w-6 h-6 relative flex flex-col justify-center items-center">
                <span className={`absolute w-5 h-0.5 bg-current rounded-full transition-all duration-300 ease-out ${isMenuOpen ? 'rotate-45' : '-translate-y-1.5'}`}></span>
                <span className={`absolute w-5 h-0.5 bg-current rounded-full transition-all duration-300 ease-out ${isMenuOpen ? 'opacity-0 scale-0' : 'opacity-100'}`}></span>
                <span className={`absolute w-5 h-0.5 bg-current rounded-full transition-all duration-300 ease-out ${isMenuOpen ? '-rotate-45' : 'translate-y-1.5'}`}></span>
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div className={`
          lg:hidden absolute top-full left-0 right-0 transition-all duration-500 ease-out
          ${isMenuOpen 
            ? 'opacity-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 -translate-y-4 pointer-events-none'
          }
        `}>
          <div className="mx-4 mt-2 bg-slate-800/98 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-lg overflow-hidden">
            <div className="p-4 space-y-1">
              <Link href="/subscription" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-slate-700/50 rounded-md transition-all duration-200 no-underline">
                Subscription
              </Link>


              <div className="p-4 space-y-1">
                <Link href="/canvas" className="text-white/90 hover:text-red-400 text-sm font-medium cursor-pointer transition-colors duration-20">Canvas lab</Link>
              </div>
              <div className="p-4 space-y-1">
                <Link href="/bug-report" className="text-white/90 hover:text-white text-sm font-medium transition-colors duration-200 no-underline">
                  Bug Report
               </Link>
              </div>
              <div className="p-4 space-y-1">
              <Link href="/subscription" className="text-white/90 hover:text-white text-sm font-medium transition-colors duration-200 no-underline">
                Pricing
              </Link>
              </div>

              {mounted && hasCheckedAuth && (currentUser ? (
                <div className="block px-4 py-3 text-white/90 hover:text-red-400 hover:bg-slate-700/50 rounded-md cursor-pointer transition-all duration-200" onClick={handleLogout}>
                  Logout
                </div>
              ) : (
                <Link href="/login" className="block px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200 text-center font-medium no-underline mt-3">
                  Login or Register
                </Link>
              ))}
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
            onClick={() => setIsMenuOpen(false)}
          />
        )}
      </nav>

      {/* Spacer */}
      <div className="h-14 lg:h-16"></div>
    </>
  );
};

export default Navbar;
