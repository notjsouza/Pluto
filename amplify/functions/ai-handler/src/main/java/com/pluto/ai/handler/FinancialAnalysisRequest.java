package com.pluto.ai.handler;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

/** Mirrors the TypeScript FinancialAnalysisRequest + its nested types. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class FinancialAnalysisRequest {

    @JsonProperty("totalMonthlySpending")
    public double totalMonthlySpending;

    @JsonProperty("subscriptions")
    public List<Subscription> subscriptions;

    @JsonProperty("topTransactions")
    public List<TopTransaction> topTransactions;

    @JsonProperty("spendingByCategory")
    public Map<String, Double> spendingByCategory;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Subscription {
        public String name;
        public double amount;
        public String frequency;
        public String category;
        public String confidence;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TopTransaction {
        public String description;
        public double amount;
        public String category;
        public String date;
    }
}
