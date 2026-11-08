// Server-only. Auth0 is optional: without AUTH0_DOMAIN there is no client and admins use the password.
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = process.env.AUTH0_DOMAIN ? new Auth0Client() : null;
