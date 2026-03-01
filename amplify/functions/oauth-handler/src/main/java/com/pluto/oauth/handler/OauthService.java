package com.pluto.oauth.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pluto.lambda.common.LambdaUtils;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class OauthService {

    private final CognitoService cognitoService = new CognitoService();
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = LambdaUtils.MAPPER;

    // -- OPTIONS pre-flight ---------------------------------------------------

    public Map<String, Object> handleOptions(Map<String, Object> event) {
        return LambdaUtils.optionsResponse(event);
    }

    // -- /debug ---------------------------------------------------------------

    public Map<String, Object> handleDebug(Map<String, Object> event) {
        String googleClientId     = System.getenv("GOOGLE_CLIENT_ID");
        String googleClientSecret = System.getenv("GOOGLE_CLIENT_SECRET");
        String frontendUrl        = System.getenv("FRONTEND_URL");

        Map<String, Object> env = Map.of(
                "hasGoogleClientId",     googleClientId != null && !googleClientId.isBlank(),
                "hasGoogleClientSecret", googleClientSecret != null && !googleClientSecret.isBlank(),
                "hasFrontendUrl",        frontendUrl != null && !frontendUrl.isBlank(),
                "frontendUrl",           frontendUrl != null ? frontendUrl : ""
        );

        return LambdaUtils.successResponse(event, Map.of(
                "message", "Debug endpoint working",
                "environment", env
        ));
    }

    // -- /auth/google ---------------------------------------------------------

    public Map<String, Object> handleGoogleAuth(Map<String, Object> event) {
        String googleClientId = System.getenv("GOOGLE_CLIENT_ID");
        if (googleClientId == null || googleClientId.isBlank()
                || googleClientId.equals("placeholder-client-id")) {
            return LambdaUtils.errorResponse(500, event, "Google OAuth not configured");
        }

        String redirectUri = OauthUtils.resolveRedirectUri(event);
        String state       = UUID.randomUUID().toString().replace("-", "").substring(0, 13);
        String scope       = "openid email profile";

        String authUrl = "https://accounts.google.com/o/oauth2/v2/auth?"
                + "client_id=" + googleClientId + "&"
                + "redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8) + "&"
                + "response_type=code&"
                + "scope=" + URLEncoder.encode(scope, StandardCharsets.UTF_8) + "&"
                + "state=" + state;

        return LambdaUtils.redirectResponse(event, authUrl);
    }

    // -- /auth/google/callback ------------------------------------------------

    @SuppressWarnings("unchecked")
    public Map<String, Object> handleGoogleCallback(Map<String, Object> event) {
        Map<String, String> queryParams =
                (Map<String, String>) event.getOrDefault("queryStringParameters", Map.of());
        String code = queryParams.get("code");

        if (code == null || code.isBlank()) {
            return LambdaUtils.errorResponse(400, event, "Authorization code not provided");
        }

        String googleClientId     = System.getenv("GOOGLE_CLIENT_ID");
        String googleClientSecret = System.getenv("GOOGLE_CLIENT_SECRET");

        if (googleClientId == null || googleClientSecret == null
                || googleClientId.equals("placeholder-client-id")
                || googleClientSecret.equals("placeholder-client-secret")) {
            return LambdaUtils.errorResponse(500, event,
                    "Google OAuth not configured – set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
        }

        String redirectUri = OauthUtils.resolveRedirectUri(event);

        try {
            // -- 1. Exchange authorisation code for tokens ------------------
            String tokenBody = "grant_type=authorization_code"
                    + "&client_id="     + URLEncoder.encode(googleClientId,     StandardCharsets.UTF_8)
                    + "&client_secret=" + URLEncoder.encode(googleClientSecret, StandardCharsets.UTF_8)
                    + "&redirect_uri="  + URLEncoder.encode(redirectUri,        StandardCharsets.UTF_8)
                    + "&code="          + URLEncoder.encode(code,               StandardCharsets.UTF_8);

            HttpRequest tokenRequest = HttpRequest.newBuilder()
                    .uri(URI.create("https://oauth2.googleapis.com/token"))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(tokenBody))
                    .build();

            HttpResponse<String> tokenResponse =
                    httpClient.send(tokenRequest, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> tokenData = mapper.readValue(tokenResponse.body(), Map.class);

            if (tokenResponse.statusCode() != 200) {
                return LambdaUtils.jsonResponse(400, event,
                        Map.of("error", "Failed to exchange code for token", "details", tokenData));
            }

            String accessToken = (String) tokenData.get("access_token");
            String idToken     = (String) tokenData.getOrDefault("id_token", "");

            // -- 2. Fetch Google user info ----------------------------------
            HttpRequest userInfoRequest = HttpRequest.newBuilder()
                    .uri(URI.create("https://www.googleapis.com/oauth2/v2/userinfo"))
                    .header("Authorization", "Bearer " + accessToken)
                    .GET()
                    .build();

            HttpResponse<String> userInfoResponse =
                    httpClient.send(userInfoRequest, HttpResponse.BodyHandlers.ofString());

            if (userInfoResponse.statusCode() != 200) {
                return LambdaUtils.errorResponse(400, event, "Failed to get user info");
            }

            GoogleUserInfo userInfo = mapper.readValue(userInfoResponse.body(), GoogleUserInfo.class);

            // -- 3. Create or retrieve the Cognito user ---------------------
            Map<String, Object> cognitoResult = null;
            try {
                cognitoResult = cognitoService.createOrGetUser(userInfo);
            } catch (Exception e) {
                System.err.println("Cognito error: " + e.getMessage());
            }

            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("success", true);
            responseBody.put("user", userInfo);
            responseBody.put("tokens", Map.of("access_token", accessToken, "id_token", idToken));
            responseBody.put("cognitoTokens", cognitoResult);

            return LambdaUtils.successResponse(event, responseBody);

        } catch (Exception e) {
            System.err.println("Error in Google callback: " + e.getMessage());
            return LambdaUtils.errorResponse(500, event, "Internal server error");
        }
    }
}