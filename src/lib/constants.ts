export const CONFIG = {
  OAUTH_HANDLER_URL: process.env.NEXT_PUBLIC_OAUTH_HANDLER_URL || 'https://ytzpw6srolqwuiwvjyszzhkbyu0njapp.lambda-url.us-west-1.on.aws',
  PLAID_HANDLER_URL: process.env.NEXT_PUBLIC_PLAID_HANDLER_URL || 'https://ccqi52efoid2eks5klxua4rztq0bnzih.lambda-url.us-west-1.on.aws',
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api',
  FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
  PLAID_ENV: process.env.NEXT_PUBLIC_PLAID_ENV || 'sandbox',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
} as const;

export const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

export const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});
