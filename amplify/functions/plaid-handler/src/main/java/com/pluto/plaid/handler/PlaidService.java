package com.pluto.plaid.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pluto.lambda.common.LambdaUtils;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

public class PlaidService {

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = LambdaUtils.MAPPER;

    // -- Plaid client config ---------------------------------------------------

    private String plaidBase() {
        String env = System.getenv("PLAID_ENV");
        if (env == null || env.isBlank()) env = "sandbox";
        switch (env.toLowerCase()) {
            case "production":  return "https://production.plaid.com";
            case "development": return "https://development.plaid.com";
            default:            return "https://sandbox.plaid.com";
        }
    }

    private String clientId() { return System.getenv("PLAID_CLIENT_ID"); }
    private String secret()   { return System.getenv("PLAID_SECRET"); }

    private void validateCredentials() {
        if (clientId() == null || secret() == null
                || clientId().isBlank() || secret().isBlank()) {
            throw new RuntimeException("Plaid credentials not configured");
        }
    }

    /**
     * Posts {@code body} to a Plaid endpoint and returns the parsed JSON as a Map.
     * Automatically injects client_id and secret into the request body.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> plaidPost(String path, Map<String, Object> body) throws Exception {
        // Merge credentials into body
        Map<String, Object> fullBody = new java.util.HashMap<>(body);
        fullBody.put("client_id", clientId());
        fullBody.put("secret", secret());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(plaidBase() + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(fullBody)))
                .build();

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        return mapper.readValue(response.body(), Map.class);
    }

    // -- /create-link-token ----------------------------------------------------

    @SuppressWarnings("unchecked")
    public Map<String, Object> handleCreateLinkToken(Map<String, Object> event) {
        try {
            validateCredentials();

            Map<String, Object> body = LambdaUtils.parseBody(event, Map.class);
            String userId = (body != null && body.get("userId") != null)
                    ? body.get("userId").toString() : "demo-user";

            Map<String, Object> plaidBody = Map.of(
                    "user", Map.of("client_user_id", userId),
                    "client_name", "Pluto",
                    "products", List.of("transactions"),
                    "country_codes", List.of("US"),
                    "language", "en"
            );

            Map<String, Object> plaidResp = plaidPost("/link/token/create", plaidBody);

            if (plaidResp.containsKey("error_code")) {
                return LambdaUtils.jsonResponse(500, event, Map.of(
                        "success", false, "error", plaidResp.getOrDefault("error_message", "Plaid error")));
            }

            return LambdaUtils.successResponse(event, Map.of(
                    "success", true,
                    "link_token", plaidResp.get("link_token")
            ));

        } catch (Exception e) {
            System.err.println("Error creating link token: " + e.getMessage());
            return LambdaUtils.jsonResponse(500, event,
                    Map.of("success", false, "error", e.getMessage()));
        }
    }

    // -- /exchange-public-token ------------------------------------------------

    @SuppressWarnings("unchecked")
    public Map<String, Object> handleExchangePublicToken(Map<String, Object> event) {
        try {
            validateCredentials();

            Map<String, Object> body = LambdaUtils.parseBody(event, Map.class);
            if (body == null || body.get("public_token") == null) {
                return LambdaUtils.jsonResponse(400, event,
                        Map.of("success", false, "error", "public_token is required"));
            }

            Map<String, Object> plaidResp = plaidPost("/item/public_token/exchange",
                    Map.of("public_token", body.get("public_token")));

            if (plaidResp.containsKey("error_code")) {
                return LambdaUtils.jsonResponse(500, event, Map.of(
                        "success", false, "error", plaidResp.getOrDefault("error_message", "Plaid error")));
            }

            return LambdaUtils.successResponse(event, Map.of(
                    "success", true,
                    "access_token", plaidResp.get("access_token"),
                    "item_id", plaidResp.get("item_id")
            ));

        } catch (Exception e) {
            System.err.println("Error exchanging public token: " + e.getMessage());
            return LambdaUtils.jsonResponse(500, event,
                    Map.of("success", false, "error", e.getMessage()));
        }
    }

    // -- /accounts -------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public Map<String, Object> handleGetAccounts(Map<String, Object> event) {
        try {
            validateCredentials();

            Map<String, Object> body = LambdaUtils.parseBody(event, Map.class);
            if (body == null || body.get("access_token") == null) {
                return LambdaUtils.jsonResponse(400, event,
                        Map.of("success", false, "error", "access_token is required"));
            }

            Map<String, Object> plaidResp = plaidPost("/accounts/get",
                    Map.of("access_token", body.get("access_token")));

            if (plaidResp.containsKey("error_code")) {
                return LambdaUtils.jsonResponse(500, event, Map.of(
                        "success", false, "error", plaidResp.getOrDefault("error_message", "Plaid error")));
            }

            return LambdaUtils.successResponse(event, Map.of(
                    "success", true,
                    "accounts", plaidResp.get("accounts")
            ));

        } catch (Exception e) {
            System.err.println("Error fetching accounts: " + e.getMessage());
            return LambdaUtils.jsonResponse(500, event,
                    Map.of("success", false, "error", e.getMessage()));
        }
    }

    // -- /transactions ---------------------------------------------------------

    @SuppressWarnings("unchecked")
    public Map<String, Object> handleGetTransactions(Map<String, Object> event) {
        try {
            validateCredentials();

            Map<String, Object> body = LambdaUtils.parseBody(event, Map.class);
            if (body == null || body.get("access_token") == null) {
                return LambdaUtils.jsonResponse(400, event,
                        Map.of("success", false, "error", "access_token is required"));
            }

            String today     = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
            String startDate = body.getOrDefault("start_date", "2023-01-01").toString();
            String endDate   = body.getOrDefault("end_date", today).toString();

            Map<String, Object> plaidResp = plaidPost("/transactions/get", Map.of(
                    "access_token", body.get("access_token"),
                    "start_date", startDate,
                    "end_date", endDate
            ));

            if (plaidResp.containsKey("error_code")) {
                return LambdaUtils.jsonResponse(500, event, Map.of(
                        "success", false, "error", plaidResp.getOrDefault("error_message", "Plaid error")));
            }

            return LambdaUtils.successResponse(event, Map.of(
                    "success", true,
                    "transactions", plaidResp.get("transactions"),
                    "accounts", plaidResp.get("accounts"),
                    "total_transactions", plaidResp.get("total_transactions")
            ));

        } catch (Exception e) {
            System.err.println("Error fetching transactions: " + e.getMessage());
            return LambdaUtils.jsonResponse(500, event,
                    Map.of("success", false, "error", e.getMessage()));
        }
    }
}
