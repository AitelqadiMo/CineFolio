// cognito.js — zero-dependency Cognito auth over the cognito-idp JSON API.
// Flows: sign up -> email code confirm -> sign in (USER_PASSWORD_AUTH over TLS),
// silent refresh via REFRESH_TOKEN_AUTH. ID token (aud = clientId) is what the
// API Gateway JWT authorizer validates, so that's what api.js sends.
import { CONFIG } from "./config.js";

const ENDPOINT = `https://cognito-idp.${CONFIG.region}.amazonaws.com/`;
const REFRESH_KEY = "cf.refreshToken";
const EMAIL_KEY = "cf.email";

let session = { idToken: null, exp: 0, email: null };
const listeners = new Set();

async function call(target, body) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `AWSCognitoIdentityProviderService.${target}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const type = (data.__type || "").split("#").pop();
    const err = new Error(friendly(type, data.message));
    err.code = type;
    throw err;
  }
  return data;
}

function friendly(code, fallback) {
  const map = {
    UsernameExistsException: "An account with this email already exists. Sign in instead.",
    UserNotConfirmedException: "Account not confirmed yet. Enter the code we emailed you.",
    NotAuthorizedException: "Wrong email or password.",
    UserNotFoundException: "No account with this email. Create one first.",
    CodeMismatchException: "That code doesn't match. Check the email and try again.",
    ExpiredCodeException: "Code expired. We can send a fresh one.",
    InvalidPasswordException: "Password too weak: 10+ characters with upper, lower and a number.",
    LimitExceededException: "Too many attempts. Wait a minute and retry.",
    TooManyRequestsException: "Too many attempts. Wait a minute and retry.",
  };
  return map[code] || fallback || "Something went wrong. Try again.";
}

function adopt(auth, email) {
  const { IdToken, RefreshToken, ExpiresIn } = auth;
  session = { idToken: IdToken, exp: Date.now() + (ExpiresIn - 90) * 1000, email };
  if (RefreshToken) localStorage.setItem(REFRESH_KEY, RefreshToken);
  if (email) localStorage.setItem(EMAIL_KEY, email);
  listeners.forEach((fn) => fn(getUser()));
}

export function getUser() {
  if (!session.idToken) return null;
  try {
    const claims = JSON.parse(atob(session.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const g = claims["cognito:groups"];
    return { email: claims.email || session.email, sub: claims.sub, admin: Array.isArray(g) ? g.includes("admin") : String(g || "").includes("admin") };
  } catch {
    return { email: session.email, sub: null, admin: false };
  }
}

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function signUp(email, password) {
  await call("SignUp", { ClientId: CONFIG.clientId, Username: email, Password: password, UserAttributes: [{ Name: "email", Value: email }] });
  localStorage.setItem(EMAIL_KEY, email);
}

export async function confirm(email, code) {
  await call("ConfirmSignUp", { ClientId: CONFIG.clientId, Username: email, ConfirmationCode: code });
}

export async function resendCode(email) {
  await call("ResendConfirmationCode", { ClientId: CONFIG.clientId, Username: email });
}

export async function signIn(email, password) {
  const r = await call("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CONFIG.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (!r.AuthenticationResult) throw new Error("Unsupported challenge flow. Contact the studio.");
  adopt(r.AuthenticationResult, email);
  return getUser();
}

export async function restore() {
  const rt = localStorage.getItem(REFRESH_KEY);
  if (!rt) return null;
  try {
    const r = await call("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: CONFIG.clientId, AuthParameters: { REFRESH_TOKEN: rt } });
    adopt(r.AuthenticationResult, localStorage.getItem(EMAIL_KEY));
    return getUser();
  } catch {
    localStorage.removeItem(REFRESH_KEY);
    return null;
  }
}

export async function idToken() {
  if (session.idToken && Date.now() < session.exp) return session.idToken;
  await restore();
  return session.idToken;
}

export function signOut() {
  session = { idToken: null, exp: 0, email: null };
  localStorage.removeItem(REFRESH_KEY);
  listeners.forEach((fn) => fn(null));
}
