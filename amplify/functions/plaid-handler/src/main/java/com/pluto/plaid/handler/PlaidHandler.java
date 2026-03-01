package com.pluto.plaid.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.pluto.lambda.common.LambdaUtils;
import java.util.Map;

public class PlaidHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final PlaidService service = new PlaidService();

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        String path   = LambdaUtils.getPath(event);
        String method = LambdaUtils.getMethod(event);

        if ("OPTIONS".equalsIgnoreCase(method)) {
            return LambdaUtils.optionsResponse(event);
        }

        try {
            switch (path) {
                case "/create-link-token":
                    if (!"POST".equalsIgnoreCase(method))
                        return LambdaUtils.errorResponse(405, event, "Method not allowed");
                    return service.handleCreateLinkToken(event);
                case "/exchange-public-token":
                    if (!"POST".equalsIgnoreCase(method))
                        return LambdaUtils.errorResponse(405, event, "Method not allowed");
                    return service.handleExchangePublicToken(event);
                case "/accounts":
                    if (!"POST".equalsIgnoreCase(method))
                        return LambdaUtils.errorResponse(405, event, "Method not allowed");
                    return service.handleGetAccounts(event);
                case "/transactions":
                    if (!"POST".equalsIgnoreCase(method))
                        return LambdaUtils.errorResponse(405, event, "Method not allowed");
                    return service.handleGetTransactions(event);
                default:
                    return LambdaUtils.notFoundResponse(event);
            }
        } catch (Exception e) {
            System.err.println("Unhandled error: " + e.getMessage());
            return LambdaUtils.errorResponse(500, event, "Internal server error");
        }
    }
}
