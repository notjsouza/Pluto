package com.pluto.oauth.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.pluto.lambda.common.LambdaUtils;
import java.util.Map;

public class OauthHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {
    private final OauthService service = new OauthService();

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        // Lambda Function URL (v2) uses rawPath + requestContext.http.method
        String path = (String) event.getOrDefault("rawPath", "/");

        Map<String, Object> requestContext = (Map<String, Object>) event.get("requestContext");
        Map<String, Object> http = requestContext != null
                ? (Map<String, Object>) requestContext.getOrDefault("http", Map.of())
                : Map.of();
        String method = (String) http.getOrDefault("method", "GET");

        if ("OPTIONS".equalsIgnoreCase(method)) {
            return service.handleOptions(event);
        }

        try {
            switch (path) {
                case "/debug":
                    return service.handleDebug(event);
                case "/auth/google":
                    return service.handleGoogleAuth(event);
                case "/auth/google/callback":
                    return service.handleGoogleCallback(event);
                default:
                    return LambdaUtils.notFoundResponse(event);
            }
        } catch (Exception e) {
            System.err.println("Unhandled error: " + e.getMessage());
            return LambdaUtils.errorResponse(500, event, "Internal server error");
        }
    }
}