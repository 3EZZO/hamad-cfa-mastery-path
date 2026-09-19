# Cloudflare Pages private access (no-card setup)

The tracker uses a Pages Function as an outer access gate. It runs before the
static application is served and is separate from Firebase Authentication.
Only the `tutor` and `student` gate accounts are accepted.

## Required encrypted secrets

In the Cloudflare Pages project, open **Settings > Variables and Secrets**.
Create these values as encrypted secrets for both Production and Preview:

| Secret                  | Requirement                                    |
| ----------------------- | ---------------------------------------------- |
| `GATE_TUTOR_PASSWORD`   | A unique password of at least 16 characters    |
| `GATE_STUDENT_PASSWORD` | A different password of at least 16 characters |
| `GATE_SESSION_SECRET`   | A random value of at least 32 characters       |

Do not commit these values to GitHub, place them in a normal environment
variable, or send them through chat or email. Store each user's password in a
password manager. The session secret should not be shared with either user.

The middleware fails closed with HTTP 503 if any secret is missing or too
short. This prevents a deployment mistake from making the application public.

## Authentication behavior

1. A visitor selects **Student** or **Tutor** and enters that account's access
   password.
2. A valid password creates a signed, HTTP-only, Secure, SameSite session
   cookie lasting 12 hours.
3. The visitor then signs into the tracker with the existing Firebase account.
4. Opening `/__access/logout` clears the outer access session.

Cloudflare and Firebase credentials are intentionally independent. The email
used for a Cloudflare account does not need to match the tutor's Firebase email.

## Deployment order

1. Add all three encrypted secrets to Production and Preview.
2. Deploy the branch and verify that an incognito window shows the private
   gateway instead of the tracker.
3. Test both access accounts, then test both Firebase roles.
4. Merge the change and verify the production deployment.
5. Only after the protected Cloudflare site passes should GitHub Pages be
   disabled and the repository changed to private.

## Security maintenance

- Rotate either user's password immediately if it is disclosed.
- Rotating `GATE_SESSION_SECRET` signs every device out of the outer gateway.
- Keep the Firebase membership rules in place; this gateway is an additional
  layer and does not replace Firebase authorization.
