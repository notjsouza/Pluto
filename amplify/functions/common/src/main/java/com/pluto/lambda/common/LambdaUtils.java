package com.pluto.lambda.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared Lambda utilities used by all three function modules:
 * CORS headers, response builders, and JSON body parsing.
 */
public class LambdaUtils {

    public static final ObjectMapper MAPPER = new ObjectMapper();

    private static final List<String> ALLOWED_ORIGINS = List.of(
            "https://master.de1wgui96xpih.amplifyapp.com",
            "https://dev.de1wgui96xpih.amplifyapp.com",
            "http://localhost:3000"
    );

    // -- CORS ------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public static Map<String, String> getCorsHeaders(Map<String, Object> event) {
        Map<String, String> reqHeaders =
                (Map<String, String>) event.getOrDefault("headers", Map.of());
        String origin = reqHeaders.getOrDefault("origin", reqHeaders.getOrDefault("Origin", ""));
        String allowedOrigin = ALLOWED_ORIGINS.contains(origin) ? origin : ALLOWED_ORIGINS.get(0);

        Map<String, String> cors = new HashMap<>();
        cors.put("Content-Type", "application/json");
        cors.put("Access-Control-Allow-Origin", allowedOrigin);
        cors.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        cors.put("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
        cors.put("Access-Control-Allow-Credentials", "false");
        cors.put("Access-Control-Max-Age", "86400");
        return cors;
    }

    // -- Response builders -----------------------------------------------------

    /** Serialises {@code body} to JSON and wraps it in a Lambda-compatible response map. */
    public static Map<String, Object> jsonResponse(int statusCode, Map<String, Object> event, Object body) {
        try {
            return Map.of(
                    "statusCode", statusCode,
                    "headers", getCorsHeaders(event),
                    "body", MAPPER.writeValueAsString(body)
            );
        } catch (Exception e) {
            return Map.of("statusCode", 500, "body", "{\"error\":\"Serialization error\"}");
        }
    }

    public static Map<String, Object> successResponse(Map<String, Object> event, Object body) {
        return jsonResponse(200, event, body);
    }

    public static Map<String, Object> errorResponse(int statusCode, Map<String, Object> event, String error) {
        return jsonResponse(statusCode, event, Map.of("error", error));
    }

    public static Map<String, Object> redirectResponse(Map<String, Object> event, String location) {
        Map<String, Object> headers = new HashMap<>(getCorsHeaders(event));
        headers.put("Location", location);
        return Map.of("statusCode", 302, "headers", headers, "body", "");
    }

    public static Map<String, Object> notFoundResponse(Map<String, Object> event) {
        return jsonResponse(404, event, Map.of("error", "Not found"));
    }

    public static Map<String, Object> optionsResponse(Map<String, Object> event) {
        return Map.of("statusCode", 200, "headers", getCorsHeaders(event), "body", "");
    }

    // -- Request helpers -------------------------------------------------------

    /**
     * Deserializes the Lambda event {@code body} field into the given type.
     * Returns {@code null} if the body is absent or blank.
     */
    public static <T> T parseBody(Map<String, Object> event, Class<T> type) throws Exception {
        String body = (String) event.get("body");
        if (body == null || body.isBlank()) return null;
        return MAPPER.readValue(body, type);
    }

    /** Extracts rawPath from a Lambda Function URL v2 event. */
    public static String getPath(Map<String, Object> event) {
        return (String) event.getOrDefault("rawPath", "/");
    }

    /** Extracts the HTTP method from a Lambda Function URL v2 event. */
    @SuppressWarnings("unchecked")
    public static String getMethod(Map<String, Object> event) {
        Map<String, Object> rc = (Map<String, Object>) event.get("requestContext");
        if (rc == null) return "GET";
        Map<String, Object> http = (Map<String, Object>) rc.getOrDefault("http", Map.of());
        return (String) http.getOrDefault("method", "GET");
    }
}
