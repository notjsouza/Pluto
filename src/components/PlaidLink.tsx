'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { PlaidService } from '../lib/plaid';

interface PlaidLinkProps {
  userId: string;
  onSuccess: (accessToken: string, itemId: string) => void;
  onError?: (error: Error) => void;
  className?: string;
}

interface PlaidError {
  error_message?: string;
}

function PlaidLinkButton({
  linkToken,
  onSuccess,
  onError,
  className,
}: {
  linkToken: string;
  onSuccess: (accessToken: string, itemId: string) => void;
  onError?: (error: Error) => void;
  className?: string;
}) {
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => { onSuccessRef.current = onSuccess; });
  useEffect(() => { onErrorRef.current = onError; });

  const handleSuccess = useCallback(async (public_token: string) => {
    try {
      const { accessToken, itemId } = await PlaidService.exchangePublicToken(public_token);
      onSuccessRef.current(accessToken, itemId);
    } catch (error) {
      console.error('Failed to exchange public token:', error);
      onErrorRef.current?.(error as Error);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: (error: unknown) => {
      if (error) {
        console.error('Plaid Link exit with error:', error);
        const msg =
          typeof error === 'object' && error !== null && 'error_message' in error
            ? (error as PlaidError).error_message || 'Plaid Link failed'
            : 'Plaid Link failed';
        onErrorRef.current?.(new Error(msg));
      }
    },
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className={`flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-lg transition-colors ${className || ''}`}
    >
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      Connect Bank Account
    </button>
  );
}

// Outer component — fetches the link token; renders the inner component only
// once the token is ready so usePlaidLink (and its script injection) runs once.
export default function PlaidLink({ userId, onSuccess, onError, className }: PlaidLinkProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  useEffect(() => {
    let cancelled = false;
    const createLinkToken = async () => {
      try {
        setLoading(true);
        const token = await PlaidService.createLinkToken(userId);
        if (!cancelled) setLinkToken(token);
      } catch (error) {
        console.error('Failed to create link token:', error);
        if (!cancelled) onErrorRef.current?.(error as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    createLinkToken();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading || !linkToken) {
    return (
      <button
        disabled
        className={`flex items-center justify-center px-6 py-3 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed ${className || ''}`}
      >
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
        Loading...
      </button>
    );
  }

  return (
    <PlaidLinkButton
      linkToken={linkToken}
      onSuccess={onSuccess}
      onError={onError}
      className={className}
    />
  );
}
