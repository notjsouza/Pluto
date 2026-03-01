package com.pluto.oauth.handler;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import java.util.Map;
import java.util.UUID;

public class CognitoService {

    private final CognitoIdentityProviderClient client;

    public CognitoService() {
        String regionEnv = System.getenv("AWS_REGION");
        Region region = (regionEnv != null && !regionEnv.isBlank())
                ? Region.of(regionEnv)
                : Region.US_WEST_1;

        // Use the lightweight URL-connection HTTP client – avoids Netty overhead in Lambda
        this.client = CognitoIdentityProviderClient.builder()
                .region(region)
                .httpClient(UrlConnectionHttpClient.builder().build())
                .build();
    }

    /**
     * Mirrors the TypeScript createOrGetCognitoUser function:
     * tries to fetch an existing user and, if not found, creates one with a
     * permanent password (suppressing the welcome email).
     */
    public Map<String, Object> createOrGetUser(GoogleUserInfo userInfo) {
        String userPoolId = System.getenv("USER_POOL_ID");
        if (userPoolId == null || userPoolId.isBlank()) {
            throw new RuntimeException("Cognito User Pool configuration missing – set USER_POOL_ID");
        }

        try {
            // -- Try to find the user --------------------------------------
            client.adminGetUser(AdminGetUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(userInfo.email)
                    .build());

            return Map.of("status", "existing_user");

        } catch (UserNotFoundException notFound) {
            // -- User doesn't exist yet → create it -----------------------
            try {
                String tempPassword = UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "Aa1!";

                client.adminCreateUser(AdminCreateUserRequest.builder()
                        .userPoolId(userPoolId)
                        .username(userInfo.email)
                        .userAttributes(
                                AttributeType.builder().name("email").value(userInfo.email).build(),
                                AttributeType.builder().name("email_verified").value("true").build(),
                                AttributeType.builder().name("given_name")
                                        .value(userInfo.givenName != null ? userInfo.givenName : "").build(),
                                AttributeType.builder().name("family_name")
                                        .value(userInfo.familyName != null ? userInfo.familyName : "").build(),
                                AttributeType.builder().name("name")
                                        .value(userInfo.name != null ? userInfo.name : "").build()
                        )
                        .messageAction(MessageActionType.SUPPRESS)
                        .temporaryPassword(tempPassword)
                        .build());

                // Immediately promote to a permanent password so the user
                // is not stuck in FORCE_CHANGE_PASSWORD state
                String permanentPassword =
                        UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "Aa1!";

                client.adminSetUserPassword(AdminSetUserPasswordRequest.builder()
                        .userPoolId(userPoolId)
                        .username(userInfo.email)
                        .password(permanentPassword)
                        .permanent(true)
                        .build());

                return Map.of("status", "created_user");

            } catch (Exception createEx) {
                System.err.println("Failed to create Cognito user: " + createEx.getMessage());
                throw new RuntimeException("Failed to create Cognito user", createEx);
            }
        }
    }
}