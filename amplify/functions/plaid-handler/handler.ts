import { Handler } from 'aws-lambda';
import { PlaidApi, Configuration, PlaidEnvironments, LinkTokenCreateRequest, ItemPublicTokenExchangeRequest, AccountsGetRequest, TransactionsGetRequest, Products, CountryCode } from 'plaid';

interface LambdaFunctionUrlEvent {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  requestContext: {
    accountId: string;
    apiId: string;
    domainName: string;
    domainPrefix: string;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    requestId: string;
    routeKey: string;
    stage: string;
    time: string;
    timeEpoch: number;
  };
  body?: string;
  isBase64Encoded: boolean;
}

interface LambdaFunctionUrlResponse {
  statusCode: number;
  headers?: Record<string, string | undefined>;
  body: string;
}

const getCorsHeaders = (origin?: string) => {
  const allowedOrigins = [
    'https://master.de1wgui96xpih.amplifyapp.com',
    'http://localhost:3000'
  ];
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://master.de1wgui96xpih.amplifyapp.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Max-Age': '86400',
  };
};

const getPlaidClient = () => {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || 'sandbox';
  
  if (!clientId || !secret) {
    throw new Error('Plaid credentials not configured');
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  return new PlaidApi(configuration);
};

export const handler: Handler<LambdaFunctionUrlEvent, LambdaFunctionUrlResponse> = async (event) => {
  const path = event.rawPath;
  const method = event.requestContext.http.method;
  const origin = event.headers?.origin || event.headers?.Origin;

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: '',
    };
  }

  try {
    const plaidClient = getPlaidClient();


    if (path === '/create-link-token' && method === 'POST') {
      try {
        const body = event.body ? JSON.parse(event.body) : {};
        const userId = body.userId || 'demo-user';
        const linkTokenRequest: LinkTokenCreateRequest = {
          user: {
            client_user_id: userId,
          },
          client_name: 'Pluto',
          products: [Products.Transactions],
          country_codes: [CountryCode.Us],
          language: 'en',
        };

        const response = await plaidClient.linkTokenCreate(linkTokenRequest);
        
        return {
          statusCode: 200,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({
            success: true,
            link_token: response.data.link_token,
          }),
        };
      } catch (linkError) {
        console.error('Error creating link token:', linkError);
        return {
          statusCode: 500,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({
            success: false,
            error: linkError instanceof Error ? linkError.message : 'Failed to create link token',
          }),
        };
      }
    }

    if (path === '/exchange-public-token' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const publicToken = body.public_token;

      if (!publicToken) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({
            success: false,
            error: 'public_token is required',
          }),
        };
      }

      const exchangeRequest: ItemPublicTokenExchangeRequest = {
        public_token: publicToken,
      };

      const response = await plaidClient.itemPublicTokenExchange(exchangeRequest);

      return {
        statusCode: 200,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({
          success: true,
          access_token: response.data.access_token,
          item_id: response.data.item_id,
        }),
      };
    }

    if (path === '/accounts' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const accessToken = body.access_token;

      if (!accessToken) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({
            success: false,
            error: 'access_token is required',
          }),
        };
      }

      const accountsRequest: AccountsGetRequest = {
        access_token: accessToken,
      };

      const response = await plaidClient.accountsGet(accountsRequest);

      return {
        statusCode: 200,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({
          success: true,
          accounts: response.data.accounts,
        }),
      };
    }

    if (path === '/transactions' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const accessToken = body.access_token;
      const startDate = body.start_date || '2023-01-01';
      const endDate = body.end_date || new Date().toISOString().split('T')[0];

      if (!accessToken) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({
            success: false,
            error: 'access_token is required',
          }),
        };
      }

      const transactionsRequest: TransactionsGetRequest = {
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
      };

      const response = await plaidClient.transactionsGet(transactionsRequest);

      return {
        statusCode: 200,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({
          success: true,
          transactions: response.data.transactions,
          accounts: response.data.accounts,
          total_transactions: response.data.total_transactions,
        }),
      };
    }

    return {
      statusCode: 404,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({
        success: false,
        error: 'Route not found',
      }),
    };

  } catch (error: unknown) {
    console.error('Plaid handler error:', error);

    return {
      statusCode: 500,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
