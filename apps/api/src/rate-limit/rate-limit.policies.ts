export type RateLimitRule = {
  /** Stable bucket prefix; changing it resets every counter for the rule. */
  name: string;
  limit: number;
  windowMs: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function rule(name: string, limit: number, windowMs: number): RateLimitRule {
  return { name, limit, windowMs };
}

/**
 * Per-IP rules slow spraying across accounts; per-account rules cannot be
 * bypassed by rotating IPs or headers. Account keys use the normalized email
 * whether or not it is registered, so limits never reveal account existence.
 */
export const RATE_LIMITS = {
  loginIp: rule('login:ip', 30, 15 * MINUTE),
  loginAccountIp: rule('login-fail:account-ip', 5, 15 * MINUTE),
  loginAccount: rule('login-fail:account', 20, HOUR),

  registerIp: rule('register:ip', 20, HOUR),

  otpVerifyUser: rule('otp-fail:user', 5, 15 * MINUTE),
  otpVerifyUserDaily: rule('otp-fail:user-day', 20, 24 * HOUR),
  otpVerifyIp: rule('otp-verify:ip', 30, 15 * MINUTE),
  otpSendUser: rule('otp-send:user', 5, HOUR),
  otpSendIp: rule('otp-send:ip', 20, HOUR),

  resetRequestIp: rule('reset-request:ip', 10, HOUR),
  resetRequestAccount: rule('reset-request:account', 3, HOUR),
  resetSubmitIp: rule('reset-submit:ip', 10, 15 * MINUTE),

  invitePreviewIp: rule('invite-preview:ip', 60, 15 * MINUTE),
  inviteSignupIp: rule('invite-signup:ip', 30, HOUR),
  inviteJoinUser: rule('invite-join:user', 20, 15 * MINUTE),

  platformLoginIp: rule('platform-login:ip', 20, 15 * MINUTE),
  platformLoginAccount: rule('platform-login-fail:account', 5, 15 * MINUTE),
} as const satisfies Record<string, RateLimitRule>;
