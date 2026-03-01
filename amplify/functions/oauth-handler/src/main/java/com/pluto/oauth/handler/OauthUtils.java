package com.pluto.oauth.handler;

import java.util.Map;

/** OAuth-specific utilities. Shared response/CORS helpers live in LambdaUtils (common module). */
public class OauthUtils {

    /**
     * Resolves the OAuth callback redirect URI based on the originating request.
     * Localhost referer -> localhost redirect URI; otherwise uses FRONTEND_URL env var.
     */
    @SuppressWarnings("unchecked")
    public static String resolveRedirectUri(Map<String, Object> event) {
        Map<String, String> headers = (Map<String, String>) event.getOrDefault("headers", Map.of());
        String referer = headers.getOrDefault("referer", headers.getOrDefault("Referer", ""));
        if (referer.contains("localhost")) {
            return "http://localhost:3000/auth/google/callback";
        }
        String frontendUrl = System.getenv("FRONTEND_URL");
        if (frontendUrl == null || frontendUrl.isBlank()) {
            frontendUrl = "https://master.de1wgui96xpih.amplifyapp.com";
        }
        return frontendUrl + "/auth/google/callback";
    }
}