"use client";
import { Authenticator } from '@aws-amplify/ui-react';
import { AuthUser } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function AuthenticatedRedirect({ user }: { user: AuthUser }) {
  const router = useRouter();
  
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  return (
    <div className="text-center p-6 bg-blue-50 rounded-lg border border-blue-200">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-blue-600">Redirecting to dashboard...</p>
    </div>
  );
}

function Login() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-600">
            Sign in to access your Pluto dashboard
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="w-full">
            <Authenticator
              variation="default"
              loginMechanisms={['email']}
              hideSignUp={false}
              components={{
                Header() {
                  return null;
                },
              }}
            >
            {({ user }: { signOut?: () => void; user?: AuthUser }) => {
              if (user) {
                return <AuthenticatedRedirect user={user} />;
              }

              return <div></div>;
            }}
            </Authenticator>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;