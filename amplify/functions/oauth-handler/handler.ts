import { Handler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

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

export const handler: Handler<LambdaFunctionUrlEvent, LambdaFunctionUrlResponse> = async (event) => {
  const path = event.rawPath;
  const queryParams = event.queryStringParameters || {};
  const origin = event.headers?.origin || event.headers?.Origin;

  const getCorsHeaders = () => {
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

  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: '',
    };
  }

  try {
    if (path === '/debug') {
      return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          message: 'Debug endpoint working',
          environment: {
            hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
            hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
            hasFrontendUrl: !!process.env.FRONTEND_URL,
            frontendUrl: process.env.FRONTEND_URL,
            allEnvKeys: Object.keys(process.env).filter(key => 
              key.includes('GOOGLE') || 
              key.includes('FRONTEND') || 
              key.includes('PLAID')
            )
          },
          path: path,
          method: event.requestContext.http.method
        }),
      };
    }

    if (path === '/auth/google') {
      const googleClientId = process.env.GOOGLE_CLIENT_ID;

      if (!googleClientId || googleClientId === 'placeholder-client-id') {
        return {
          statusCode: 500,
          headers: getCorsHeaders(),
          body: JSON.stringify({ 
            error: 'Google OAuth not configured', 
            message: 'Please set GOOGLE_CLIENT_ID environment variable',
            debug: {
              hasGoogleClientId: !!googleClientId,
              googleClientIdValue: googleClientId,
              allEnvKeys: Object.keys(process.env).filter(key => key.includes('GOOGLE') || key.includes('FRONTEND'))
            }
          }),
        };
      }
      
      const referer = event.headers?.referer || event.headers?.Referer;
      let redirectUri;
      
      if (referer && referer.includes('localhost')) {
        redirectUri = 'http://localhost:3000/auth/google/callback';
      } else {
        const frontendUrl = process.env.FRONTEND_URL || 'https://master.de1wgui96xpih.amplifyapp.com';
        redirectUri = `${frontendUrl}/auth/google/callback`;
      }
      
      const scope = 'openid email profile';
      const state = Math.random().toString(36).substring(2, 15);
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${googleClientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

      return {
        statusCode: 302,
        headers: {
          Location: authUrl,
          ...getCorsHeaders(),
        },
        body: '',
      };
    }

    if (path === '/auth/google/callback') {
      const code = queryParams.code;

      if (!code) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(),
          body: JSON.stringify({ error: 'Authorization code not provided' }),
        };
      }

      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (!googleClientId || !googleClientSecret || 
          googleClientId === 'placeholder-client-id' || 
          googleClientSecret === 'placeholder-client-secret') {
        return {
          statusCode: 500,
          headers: getCorsHeaders(),
          body: JSON.stringify({ 
            error: 'Google OAuth not configured', 
            message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables' 
          }),
        };
      }
      
      const referer = event.headers?.referer || event.headers?.Referer;
      let redirectUri;
      
      if (referer && referer.includes('localhost')) {
        redirectUri = 'http://localhost:3000/auth/google/callback';
      } else {
        const frontendUrl = process.env.FRONTEND_URL || 'https://master.de1wgui96xpih.amplifyapp.com';
        redirectUri = `${frontendUrl}/auth/google/callback`;
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: googleClientId!,
          client_secret: googleClientSecret!,
          redirect_uri: redirectUri,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(),
          body: JSON.stringify({ error: 'Failed to exchange code for token', details: tokenData }),
        };
      }

      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userInfo = await userInfoResponse.json();

      if (!userInfoResponse.ok) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(),
          body: JSON.stringify({ error: 'Failed to get user info', details: userInfo }),
        };
      }

      let cognitoResult = null;
      try {
        cognitoResult = await createOrGetCognitoUser(userInfo);
      } catch (cognitoError) {
        console.error('Cognito error:', cognitoError);
      }
      
      return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          success: true,
          user: userInfo,
          tokens: {
            access_token: tokenData.access_token,
            id_token: tokenData.id_token,
          },
          cognitoTokens: cognitoResult || null,
        }),
      };
    }

    return {
      statusCode: 404,
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

async function createOrGetCognitoUser(userInfo: GoogleUserInfo) {
  const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-west-1' });
  const userPoolId = process.env.USER_POOL_ID;
  const userPoolClientId = process.env.USER_POOL_CLIENT_ID;

  if (!userPoolId || !userPoolClientId) {
    throw new Error('Cognito User Pool configuration missing');
  }

  try {
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: userInfo.email,
    });

    await cognitoClient.send(getUserCommand);
    return { status: 'existing_user' };

  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'UserNotFoundException') {
      try {
        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: userInfo.email,
          UserAttributes: [
            { Name: 'email', Value: userInfo.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'given_name', Value: userInfo.given_name || '' },
            { Name: 'family_name', Value: userInfo.family_name || '' },
            { Name: 'name', Value: userInfo.name || '' },
          ],
          MessageAction: 'SUPPRESS',
          TemporaryPassword: Math.random().toString(36).slice(-12),
        });

        await cognitoClient.send(createUserCommand);

        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: userInfo.email,
          Password: Math.random().toString(36).slice(-12),
          Permanent: true,
        });

        await cognitoClient.send(setPasswordCommand);
        return { status: 'created_user' };

      } catch (createError) {
        console.error('Failed to create Cognito user:', createError);
        throw createError;
      }
    } else {
      console.error('Cognito error:', error);
      throw error;
    }
  }
}
