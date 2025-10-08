"use client";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface GoogleUser {
  name: string;
  email: string;
}

function Navbar() {
  const { user, signOut } = useAuthenticator((context) => [context.user, context.signOut]);
  const router = useRouter();
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);

  useEffect(() => {
    const checkAuthState = () => {
      const isOAuthAuthenticated = localStorage.getItem('oauth_authenticated') === 'true';
      const storedUser = localStorage.getItem('google_user');
      if (isOAuthAuthenticated && storedUser) {
        setGoogleUser(JSON.parse(storedUser));
      } else {
        setGoogleUser(null);
      }
    };

    checkAuthState();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'oauth_authenticated' || e.key === 'google_user') {
        checkAuthState();
      }
    };

    const handleAuthChange = () => {
      setTimeout(checkAuthState, 100);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAuthState();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleAuthChange);
    window.addEventListener('focus', checkAuthState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleAuthChange);
      window.removeEventListener('focus', checkAuthState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const isAuthenticated = user || googleUser;

  if (!isAuthenticated) {
    return null;
  }

  const handleSignOut = () => {
    if (user) {
      signOut();
    }
    
    localStorage.removeItem('oauth_authenticated');
    localStorage.removeItem('google_user');
    setGoogleUser(null);
    
    window.dispatchEvent(new Event('auth-change'));
    
    router.push('/');
  };

  const displayName = user?.signInDetails?.loginId || user?.username || googleUser?.name || 'User';

  return (
    <nav className="bg-white shadow-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-gray-900">Pluto</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">
              Welcome, {displayName}
            </span>
            <button
              onClick={handleSignOut}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;