"use client"
import React, { useEffect, useState, Suspense } from 'react';
import { User, Mail, CreditCard, Coins, Settings, Edit3, Eye, EyeOff, Calendar, Shield, ExternalLink } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useSearchParams } from "next/navigation";
import { nodeUrl } from "../../apiurl"
import Navbar from '@/components/Navbar';
interface User {
  _id: string;
  username: string;
  email: string;
  token_limit: number;
  plan: string;
  profile?: string;
  createdAt: string;
  verified: boolean;
  status: string;
  subscriptionEnd: string;
  subscriptionId: string;
  priceId: string;
  lastResetDate: string;
  paymentHistory: PaymentHistory[];
  githubId?: string;
  googleId?: string;
}

interface PaymentHistory {
  amount: number;
  date: string;
  token_limit: number;
  invoiceUrl: string;
}

interface RootState {
  user: {
    currentUser: User | null;
    accessToken: string | null;
    isFetching: boolean;
    error: string | null;
  };
}

// Separate component that uses useSearchParams
const UserProfileContent = () => {
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const searchParams = useSearchParams();
  const { currentUser } = useSelector((state: RootState) => state.user);
  const [showTokens, setShowTokens] = useState(true);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const id = searchParams.get("id");

  const handleCustomerPortal = async () => {
    if (!accessToken || !userData?.subscriptionEnd) {
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

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${nodeUrl}/api/auth/user/${id}`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            token: accessToken || ''
          },
        });
        
        if (response.ok) {
          const fetchedUserData = await response.json();
          setUserData(fetchedUserData);
          setError(null);
        } else {
          setError('Failed to fetch user data');
          console.error('Failed to fetch user data:', response.statusText);
        }
      } catch (error) {
        setError('Error fetching user data');
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id && accessToken) {
      fetchUserData();
    } else if (currentUser) {
      setUserData(currentUser);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [id, accessToken, currentUser]);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });
  };

  const formatCurrency = (amount: number) => {
    return amount;
  };

  const getUsedTokens = () => {
    if (!userData) return 0;
    return Math.max(0, 25000 - userData.token_limit);
  };

  const getUsagePercentage = () => {
    if (!userData) return 0;
    const totalTokens = 25000;
    const usedTokens = getUsedTokens();
    return Math.round((usedTokens / totalTokens) * 100);
  };

  const getPlanColor = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'free': return 'bg-gray-100 text-gray-700';
      case 'basic': return 'bg-blue-100 text-blue-700';
      case 'student': return 'bg-purple-100 text-purple-700';
      case 'custom': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPlanName = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'student': return 'student Tier';
      case 'basic': return 'Basic Tier';
      case 'custom_api': return 'custom';
      case 'free': return 'Free';
      default: return plan.charAt(0).toUpperCase() + plan.slice(1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
              <div className="space-y-4">
                <div className="h-16 bg-gray-200 rounded"></div>
                <div className="h-32 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-red-500 mb-4">
              <Shield size={48} className="mx-auto" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Profile</h2>
            <p className="text-gray-600">{error || 'User data not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
          <p className="text-gray-600">Manage your account settings and view your usage</p>
        </div>

        {/* Main Profile Card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-white/20 flex items-center justify-center">
                  {userData.profile ? (
                    <img 
                      src={userData.profile} 
                      alt={userData.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={32} className="text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{userData.username}</h2>
                  <p className="text-blue-100">Member since {formatDate(userData.createdAt)}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {userData.verified && (
                      <div className="flex items-center space-x-1">
                        <Shield size={16} className="text-green-300" />
                        <span className="text-sm text-green-300">Verified</span>
                      </div>
                    )}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      userData.status === 'active' ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'
                    }`}>
                      {userData.status}
                    </span>
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <Settings size={20} />
              </button>
            </div>
          </div>

          {/* Profile Details */}
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Account Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
                
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <User size={20} className="text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Username</p>
                    <p className="font-medium text-gray-900">{userData.username}</p>
                  </div>
                  <button className="p-1 hover:bg-gray-200 rounded">
                    <Edit3 size={16} className="text-gray-500" />
                  </button>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Mail size={20} className="text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Email Address</p>
                    <p className="font-medium text-gray-900">{userData.email}</p>
                  </div>
                  <button className="p-1 hover:bg-gray-200 rounded">
                    <Edit3 size={16} className="text-gray-500" />
                  </button>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <CreditCard size={20} className="text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Current Plan</p>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPlanColor(userData.plan)}`}>
                        {getPlanName(userData.plan)}
                      </span>
                    </div>
                  </div>
                  <button onClick={handleCustomerPortal} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                    Manage
                  </button>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar size={20} className="text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Last credits Reset</p>
                    <p className="font-medium text-gray-900">{formatDate(userData.lastResetDate)}</p>
                  </div>
                </div>
              </div>

              {/* Token Usage */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Credits Usage</h3>
                  <button 
                    onClick={() => setShowTokens(!showTokens)}
                    className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
                  >
                    {showTokens ? <EyeOff size={16} /> : <Eye size={16} />}
                    <span>{showTokens ? 'Hide' : 'Show'}</span>
                  </button>
                </div>

                {showTokens ? (
                  <div className="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Coins size={24} className="text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Available credits</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatNumber(userData.token_limit)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Usage this month</span>
                        <span className="font-medium">{getUsagePercentage()}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${getUsagePercentage()}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-center space-x-2 text-gray-500">
                      <EyeOff size={20} />
                      <p>Token usage hidden</p>
                    </div>
                    <p className="text-sm text-gray-400 text-center mt-2">
                      Click Show to view your token usage details
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Payment History */}
        {userData.paymentHistory && userData.paymentHistory.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h3>
              <div className="space-y-3">
                {userData.paymentHistory.slice(0, 3).map((payment, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CreditCard size={16} className="text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">${formatCurrency(payment.amount)}</p>
                        <p className="text-sm text-gray-500">{formatDate(payment.date)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{formatNumber(payment.token_limit)} tokens</p>
                      {payment.invoiceUrl && (
                        <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1">
                          <span>Invoice</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Loading component for Suspense fallback
const ProfileLoading = () => (
  <div className="min-h-screen bg-gray-50 p-4 md:p-6">
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Main component with Suspense boundary
const UserProfile = () => {
  return (
    <Suspense fallback={<ProfileLoading />}>
      <Navbar url="http://localhost:5000" />
      <UserProfileContent />
    </Suspense>
  );
};

export default UserProfile;