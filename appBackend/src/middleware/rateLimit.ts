import rateLimit from 'express-rate-limit';

/** Brute-force protection for login, register, forgot-password, OAuth token exchange. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});

/** Stricter limit for password reset to reduce email abuse. */
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again later.' },
});

/** Limit OTP emails so a stolen inbox is not flooded. */
export const sendOtpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in codes requested. Try again later.' },
});

/** Invite-code redeem is guessable — keep brute-force cheap to block. */
export const squadJoinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many join attempts. Try again later.' },
});
