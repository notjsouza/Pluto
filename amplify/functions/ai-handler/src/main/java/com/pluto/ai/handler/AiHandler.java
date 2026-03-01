package com.pluto.ai.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.pluto.lambda.common.LambdaUtils;
import java.util.Map;

public class AiHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final AiService service = new AiService();

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        String path   = LambdaUtils.getPath(event);
        String method = LambdaUtils.getMethod(event);

        if ("OPTIONS".equalsIgnoreCase(method)) {
            return LambdaUtils.optionsResponse(event);
        }

        try {
            switch (path) {
                case "/test":
                    return service.handleTest(event);
                case "/health":
                    return service.handleHealth(event);
                case "/analyze":
                    if (!"POST".equalsIgnoreCase(method))
                        return LambdaUtils.errorResponse(405, event, "Method not allowed");
                    return service.handleAnalyze(event);
                case "/ask":
                    if (!"POST".equalsIgnoreCase(method))
                        return LambdaUtils.errorResponse(405, event, "Method not allowed");
                    return service.handleAsk(event);
                default:
                    return LambdaUtils.notFoundResponse(event);
            }
        } catch (Exception e) {
            System.err.println("Unhandled error: " + e.getMessage());
            return LambdaUtils.errorResponse(500, event, "Internal server error");
        }
    }
}
