package com.pluto.oauth.handler;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Maps the JSON returned by https://www.googleapis.com/oauth2/v2/userinfo */
@JsonIgnoreProperties(ignoreUnknown = true)
public class GoogleUserInfo {
    public String id;
    public String email;

    @JsonProperty("verified_email")
    public boolean verifiedEmail;

    public String name;

    @JsonProperty("given_name")
    public String givenName;

    @JsonProperty("family_name")
    public String familyName;

    public String picture;
}