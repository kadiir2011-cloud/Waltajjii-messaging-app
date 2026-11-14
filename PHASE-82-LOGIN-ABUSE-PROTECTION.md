# Phase 82 — login abuse protection

## Delivered
- Separate registration and login rate-limit buckets.
- Limit unsuccessful login attempts to five per client IP in a 15-minute window.
- Keep registration at ten attempts per client IP in a 15-minute window.
- Set no-store/no-cache headers for all authentication-router responses, including errors and profile responses.

## Security boundaries
- IP-based protection, not account lockout; this avoids allowing an attacker to lock a victim out by targeting a username.
- Rate-limit state is held in process memory and resets on restart; multiple instances do not share counters.
- Correct trusted-proxy configuration remains important behind reverse proxies.
- No MFA, password reset, token revocation, CAPTCHA, or distributed rate-limit storage is added.

## Validation
Run `node --test test/phase82-login-abuse-protection.test.js`.

## Safety
Draft branch only. No merge, Render deployment, Supabase changes, production data access, or live-app changes.
