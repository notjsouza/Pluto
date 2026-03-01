package com.pluto.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pluto.lambda.common.LambdaUtils;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.*;

public class AiService {

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = LambdaUtils.MAPPER;

    // -- /test -----------------------------------------------------------------

    public Map<String, Object> handleTest(Map<String, Object> event) {
        String apiKey = System.getenv("OPENAI_API_KEY");
        return LambdaUtils.successResponse(event, Map.of(
                "message", "Test endpoint working",
                "hasOpenAI", apiKey != null && !apiKey.isBlank(),
                "env", Map.of(
                        "hasApiKey", apiKey != null && !apiKey.isBlank(),
                        "apiKeyLength", apiKey != null ? apiKey.length() : 0
                )
        ));
    }

    // -- /health ---------------------------------------------------------------

    public Map<String, Object> handleHealth(Map<String, Object> event) {
        String apiKey = System.getenv("OPENAI_API_KEY");
        return LambdaUtils.successResponse(event, Map.of(
                "status", "healthy",
                "openaiAvailable", apiKey != null && !apiKey.isBlank(),
                "timestamp", Instant.now().toString()
        ));
    }

    // -- /analyze --------------------------------------------------------------

    public Map<String, Object> handleAnalyze(Map<String, Object> event) {
        try {
            FinancialAnalysisRequest data = LambdaUtils.parseBody(event, FinancialAnalysisRequest.class);
            if (data == null) {
                return LambdaUtils.errorResponse(400, event, "Request body required");
            }

            List<Map<String, Object>> insights = buildInsights(data);
            return LambdaUtils.successResponse(event, Map.of("insights", insights));

        } catch (Exception e) {
            System.err.println("Error during financial analysis: " + e.getMessage());
            return LambdaUtils.errorResponse(500, event, "Analysis failed: " + e.getMessage());
        }
    }

    /**
     * Rule-based financial insights – mirrors the TypeScript /analyze logic exactly.
     */
    private List<Map<String, Object>> buildInsights(FinancialAnalysisRequest data) {
        long now = Instant.now().toEpochMilli();
        double roundedSpending = Math.round(data.totalMonthlySpending * 100.0) / 100.0;
        double avgMonthlySpending = 2000.0;

        List<Map<String, Object>> insights = new ArrayList<>();

        // 1. Spending vs average
        Map<String, Object> spendingInsight = new HashMap<>();
        if (roundedSpending > avgMonthlySpending) {
            double overPercent = Math.round(((roundedSpending - avgMonthlySpending) / avgMonthlySpending) * 100);
            double savings     = Math.round(roundedSpending - avgMonthlySpending);
            spendingInsight.put("id",          "spending-analysis-" + now);
            spendingInsight.put("type",        "warning");
            spendingInsight.put("title",       "Above Average Spending");
            spendingInsight.put("description", "You spent $" + roundedSpending + " this month, which is "
                    + overPercent + "% above typical spending. Consider reviewing your recent purchases.");
            spendingInsight.put("impact",      "Save up to $" + savings + " monthly");
            spendingInsight.put("actionable",  true);
            spendingInsight.put("priority",    "high");
            spendingInsight.put("category",    "budgeting");
            spendingInsight.put("confidence",  0.9);
            spendingInsight.put("source",      "ai");
        } else {
            double underPercent = Math.round(((avgMonthlySpending - roundedSpending) / avgMonthlySpending) * 100);
            double annualSavings = Math.round((avgMonthlySpending - roundedSpending) * 12);
            spendingInsight.put("id",          "spending-analysis-" + now);
            spendingInsight.put("type",        "achievement");
            spendingInsight.put("title",       "Great Spending Control");
            spendingInsight.put("description", "Excellent! You spent $" + roundedSpending + " this month, staying "
                    + underPercent + "% under typical spending patterns.");
            spendingInsight.put("impact",      "You're on track for annual savings of $" + annualSavings);
            spendingInsight.put("actionable",  true);
            spendingInsight.put("priority",    "medium");
            spendingInsight.put("category",    "savings");
            spendingInsight.put("confidence",  0.85);
            spendingInsight.put("source",      "ai");
        }
        insights.add(spendingInsight);

        // 2. Top category insight
        if (data.spendingByCategory != null) {
            double spendingCap = roundedSpending * 1.1;
            Optional<Map.Entry<String, Double>> topCategoryOpt = data.spendingByCategory.entrySet().stream()
                    .filter(e -> e.getValue() > 0 && e.getValue() <= spendingCap)
                    .max(Map.Entry.comparingByValue());

            if (topCategoryOpt.isPresent()) {
                String categoryName   = topCategoryOpt.get().getKey();
                double categoryAmount = topCategoryOpt.get().getValue();
                double pct = Math.round((categoryAmount / roundedSpending) * 100);

                if (pct >= 10 && categoryAmount >= 50) {
                    String capitalized = categoryName.substring(0, 1).toUpperCase()
                            + categoryName.substring(1);
                    double weeklyLimit = Math.round((categoryAmount / 4) * 100.0) / 100.0;
                    double roundedCat  = Math.round(categoryAmount * 100.0) / 100.0;

                    Map<String, Object> catInsight = new HashMap<>();
                    catInsight.put("id",          "category-insight-" + now);
                    catInsight.put("type",        "recommendation");
                    catInsight.put("title",       capitalized + " Focus");
                    catInsight.put("description", "Your " + categoryName + " spending ($" + roundedCat
                            + ") represents " + (int) pct + "% of your budget. Try setting a weekly limit of $"
                            + weeklyLimit + ".");
                    catInsight.put("impact",      "Could reduce " + categoryName + " costs by 10-20%");
                    catInsight.put("actionable",  true);
                    catInsight.put("priority",    pct > 30 ? "high" : "medium");
                    catInsight.put("category",    "spending");
                    catInsight.put("confidence",  0.8);
                    catInsight.put("source",      "ai");
                    insights.add(catInsight);
                }
            }
        }

        // 3. Subscription insight
        if (data.subscriptions != null && !data.subscriptions.isEmpty()) {
            double totalSubCost = Math.round(
                    data.subscriptions.stream().mapToDouble(s -> s.amount).sum() * 100.0) / 100.0;
            double potentialSavings = Math.round(totalSubCost * 0.3 * 100.0) / 100.0;

            Map<String, Object> subInsight = new HashMap<>();
            subInsight.put("id",          "subscription-insight-" + now);
            subInsight.put("type",        "opportunity");
            subInsight.put("title",       "Subscription Review");
            subInsight.put("description", "You have " + data.subscriptions.size()
                    + " active subscriptions costing $" + totalSubCost
                    + "/month. Review which ones you actively use.");
            subInsight.put("impact",      "Potential savings: $" + potentialSavings + "/month");
            subInsight.put("actionable",  true);
            subInsight.put("priority",    "medium");
            subInsight.put("category",    "subscriptions");
            subInsight.put("confidence",  0.75);
            subInsight.put("source",      "ai");
            insights.add(subInsight);
        }

        return insights;
    }

    // -- /ask ------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public Map<String, Object> handleAsk(Map<String, Object> event) {
        String apiKey = System.getenv("OPENAI_API_KEY");
        if (apiKey == null || apiKey.isBlank()) {
            return LambdaUtils.errorResponse(503, event, "OpenAI not configured");
        }

        try {
            Map<String, Object> body = LambdaUtils.parseBody(event, Map.class);
            if (body == null) {
                return LambdaUtils.errorResponse(400, event, "Request body required");
            }

            String question = (String) body.get("question");
            FinancialAnalysisRequest context = mapper.convertValue(
                    body.get("context"), FinancialAnalysisRequest.class);

            String answer = askOpenAI(apiKey, question, context);
            return LambdaUtils.successResponse(event, Map.of("response", answer));

        } catch (Exception e) {
            System.err.println("Error in /ask: " + e.getMessage());
            return LambdaUtils.errorResponse(500, event, "Internal server error");
        }
    }

    private String askOpenAI(String apiKey, String question, FinancialAnalysisRequest ctx)
            throws Exception {

        String userContent = "My financial context:\n"
                + "- Monthly spending: $" + ctx.totalMonthlySpending + "\n"
                + "- Subscriptions: " + mapper.writeValueAsString(ctx.subscriptions) + "\n"
                + "- Top transactions: " + mapper.writeValueAsString(ctx.topTransactions) + "\n"
                + "\nQuestion: " + question;

        Map<String, Object> requestBody = Map.of(
                "model", "gpt-4o-mini",
                "messages", List.of(
                        Map.of("role", "system",
                               "content", "You are a helpful personal financial advisor. "
                                        + "Answer questions about the user's finances based on their data. "
                                        + "Keep responses concise (max 200 words), practical, and actionable. "
                                        + "Use specific numbers from their data when relevant."),
                        Map.of("role", "user", "content", userContent)
                ),
                "max_tokens", 300,
                "temperature", 0.4
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openai.com/v1/chat/completions"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(requestBody)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseMap = mapper.readValue(response.body(), Map.class);

        if (response.statusCode() != 200) {
            throw new RuntimeException("OpenAI API error: " + response.body());
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) responseMap.get("choices");
        if (choices == null || choices.isEmpty()) {
            return "I couldn't generate a response. Please try again.";
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        String content = (String) message.get("content");
        return content != null ? content : "I couldn't generate a response. Please try again.";
    }
}
